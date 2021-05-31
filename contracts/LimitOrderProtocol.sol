// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

import "./helpers/PredicateHelper.sol";
import "./helpers/AmountCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/ERC20Proxy.sol";
import "./helpers/ERC721Proxy.sol";
import "./helpers/ERC1155Proxy.sol";
import "./interfaces/InteractiveMaker.sol";
import "./libraries/UncheckedAddress.sol";
import "./libraries/ArgumentsDecoder.sol";


contract LimitOrderProtocol is
    EIP712("1inch Limit Order Protocol", "1"),
    PredicateHelper,
    AmountCalculator,
    NonceManager,
    ImmutableOwner(address(this)),
    ERC20Proxy,
    ERC721Proxy,
    ERC1155Proxy
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using UncheckedAddress for address;
    using ArgumentsDecoder for bytes;

    // Expiration Mask:
    //   predicate := PredicateHelper.timestampBelow(deadline)
    //
    // Maker Nonce:
    //   predicate := this.nonceEquals(makerAddress, makerNonce)

    event OrderFilled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remaining
    );

    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
    );

    struct OrderRFQ {
        uint256 info;
        address makerAsset;
        address takerAsset;
        bytes makerAssetData; // (transferFrom.selector, signer, ______, makerAmount, ...)
        bytes takerAssetData; // (transferFrom.selector, sender, signer, takerAmount, ...)
    }

    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        bytes makerAssetData; // (transferFrom.selector, signer, ______, makerAmount, ...)
        bytes takerAssetData; // (transferFrom.selector, sender, signer, takerAmount, ...)
        bytes getMakerAmount; // this.staticcall(abi.encodePacked(bytes, swapTakerAmount)) => (swapMakerAmount)
        bytes getTakerAmount; // this.staticcall(abi.encodePacked(bytes, swapMakerAmount)) => (swapTakerAmount)
        bytes predicate;      // this.staticcall(bytes) => (bool)
        bytes permit;         // On first fill: permit.1.call(abi.encodePacked(permit.selector, permit.2))
        bytes interaction;
    }

    bytes32 constant public LIMIT_ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData,bytes getMakerAmount,bytes getTakerAmount,bytes predicate,bytes permit,bytes interaction)"
    );

    bytes32 constant public LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ(uint256 info,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData)"
    );

    bytes4 constant private _MAX_SELECTOR = bytes4(uint32(IERC20.transferFrom.selector) + 10);

    mapping(bytes32 => uint256) private _remaining;
    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns(bytes32) {
        return _domainSeparatorV4();
    }

    function remaining(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash].sub(1, "LOP: Unknown order");
    }

    function remainingRaw(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash];
    }

    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory results) {
        results = new uint256[](orderHashes.length);
        for (uint i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
    }

    function invalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256) {
        return _invalidator[maker][slot];
    }

    function checkPredicate(Order memory order) public view returns(bool) {
        bytes memory result = address(this).uncheckedFunctionStaticCall(order.predicate, "LOP: predicate call failed");
        require(result.length == 32, "LOP: invalid predicate return");
        return abi.decode(result, (bool));
    }

    function simulateCalls(IERC20[] calldata tokens, bytes[] calldata data) external {
        bytes memory reason = new bytes(tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory result) = address(tokens[i]).call(data[i]);
            if (success && result.length > 0) {
                success = abi.decode(result, (bool));
            }
            reason[i] = success ? bytes1("1") : bytes1("0");
        }

        // Always revert and provide per call results
        revert(string(abi.encodePacked("CALL_RESULTS_", reason)));
    }

    function cancelOrder(Order memory order) external {
        require(order.makerAssetData.decodeAddress(0) == msg.sender, "LOP: Access denied");

        bytes32 orderHash = _hash(order);
        _remaining[orderHash] = 1;
        emit OrderFilled(msg.sender, orderHash, 0);
    }

    function cancelOrderRFQ(uint256 orderInfo) external {
        _invalidator[msg.sender][uint64(orderInfo) / 256] |= (1 << (orderInfo % 256));
    }

    function fillOrderRFQ(OrderRFQ memory order, bytes memory signature, uint256 makingAmount, uint256 takingAmount) external {
        // Check time expiration
        uint256 expiration = uint128(order.info) >> 64;
        require(expiration == 0 || block.timestamp <= expiration, "LOP: order expired");  // solhint-disable-line not-rely-on-time

        // Validate double spend
        address maker = order.makerAssetData.decodeAddress(0);
        uint256 invalidator = _invalidator[maker][uint64(order.info) / 256];
        require(invalidator & (1 << (order.info % 256)) == 0, "LOP: already filled");
        _invalidator[maker][uint64(order.info) / 256] = invalidator | (1 << (order.info % 256));

        // Compute partial fill if needed
        uint256 orderMakerAmount = order.makerAssetData.decodeUint256(2);
        uint256 orderTakerAmount = order.takerAssetData.decodeUint256(2);
        if (takingAmount == 0 && makingAmount == 0) {
            // Two zeros means whole order
            makingAmount = orderMakerAmount;
            takingAmount = orderTakerAmount;
        }
        else if (takingAmount == 0) {
            takingAmount = (makingAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
        }
        else if (makingAmount == 0) {
            makingAmount = takingAmount * orderMakerAmount / orderTakerAmount;
        }
        else {
            revert("LOP: one of amounts should be 0");
        }

        require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");
        require(makingAmount <= orderMakerAmount, "LOP: making amount exceeded");
        require(takingAmount <= orderTakerAmount, "LOP: taking amount exceeded");

        // Validate order
        bytes32 orderHash = _hash(order);
        _validate(order, signature, orderHash);

        // Maker => Taker, Taker => Maker
        _callMakerAssetTransferFrom(order.makerAsset, order.makerAssetData, msg.sender, makingAmount);
        _callTakerAssetTransferFrom(order.takerAsset, order.takerAssetData, msg.sender, takingAmount);

        emit OrderFilledRFQ(orderHash, makingAmount);
    }

    function fillOrder(Order memory order, bytes calldata signature, uint256 makingAmount, uint256 takingAmount, uint256 thresholdAmount) external returns(uint256, uint256) {
        bytes32 orderHash = _hash(order);

        uint256 remainingMakerAmount;
        { // Stack too deep
            bool orderExists;
            (orderExists, remainingMakerAmount) = _remaining[orderHash].trySub(1);
            if (!orderExists) {
                // First fill: validate order and permit maker asset
                _validate(order, signature, orderHash);
                remainingMakerAmount = order.makerAssetData.decodeUint256(2);
                if (order.permit.length > 0) {
                    (address token, bytes memory permit) = abi.decode(order.permit, (address, bytes));
                    token.uncheckedFunctionCall(abi.encodePacked(IERC20Permit.permit.selector, permit), "LOP: permit failed");
                    require(_remaining[orderHash] == 0, "LOP: reentrancy detected");
                }
            }
        }

        // Check if order is valid
        if (order.predicate.length > 0) {
            require(checkPredicate(order), "LOP: predicate returned false");
        }

        // Compute maker and taker assets amount
        if ((takingAmount == 0) == (makingAmount == 0)) {
            revert("LOP: only one amount should be 0");
        }
        else if (takingAmount == 0) {
            takingAmount = _callGetTakerAmount(order, makingAmount);
            require(takingAmount <= thresholdAmount, "LOP: taking amount too high");
        }
        else {
            makingAmount = _callGetMakerAmount(order, takingAmount);
            require(makingAmount >= thresholdAmount, "LOP: making amount too low");
        }

        require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");

        // Update remaining amount in storage
        remainingMakerAmount = remainingMakerAmount.sub(makingAmount, "LOP: taking > remaining");
        _remaining[orderHash] = remainingMakerAmount + 1;
        emit OrderFilled(msg.sender, orderHash, remainingMakerAmount);

        // Taker => Maker
        _callTakerAssetTransferFrom(order.takerAsset, order.takerAssetData, msg.sender, takingAmount);

        // Maker can handle funds interactively
        if (order.interaction.length > 0) {
            InteractiveMaker(order.makerAssetData.decodeAddress(0))
                .notifyFillOrder(order.makerAsset, order.takerAsset, makingAmount, takingAmount, order.interaction);
        }

        // Maker => Taker
        _callMakerAssetTransferFrom(order.makerAsset, order.makerAssetData, msg.sender, makingAmount);

        return (makingAmount, takingAmount);
    }

    function _hash(Order memory order) internal view returns(bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LIMIT_ORDER_TYPEHASH,
                    order.salt,
                    order.makerAsset,
                    order.takerAsset,
                    keccak256(order.makerAssetData),
                    keccak256(order.takerAssetData),
                    keccak256(order.getMakerAmount),
                    keccak256(order.getTakerAmount),
                    keccak256(order.predicate),
                    keccak256(order.permit),
                    keccak256(order.interaction)
                )
            )
        );
    }

    function _hash(OrderRFQ memory order) internal view returns(bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LIMIT_ORDER_RFQ_TYPEHASH,
                    order.info,
                    order.makerAsset,
                    order.takerAsset,
                    keccak256(order.makerAssetData),
                    keccak256(order.takerAssetData)
                )
            )
        );
    }

    function _validate(Order memory order, bytes memory signature, bytes32 orderHash) internal view {
        _validate(order.makerAssetData, order.takerAssetData, signature, orderHash);
    }

    function _validate(OrderRFQ memory order, bytes memory signature, bytes32 orderHash) internal view {
        _validate(order.makerAssetData, order.takerAssetData, signature, orderHash);
    }

    function _validate(bytes memory makerAssetData, bytes memory takerAssetData, bytes memory signature, bytes32 orderHash) internal view {
        require(makerAssetData.length >= 100, "LOP: bad makerAssetData.length");
        require(takerAssetData.length >= 100, "LOP: bad takerAssetData.length");
        bytes4 makerSelector = makerAssetData.decodeSelector();
        bytes4 takerSelector = takerAssetData.decodeSelector();
        require(makerSelector >= IERC20.transferFrom.selector && makerSelector <= _MAX_SELECTOR, "LOP: bad makerAssetData.selector");
        require(takerSelector >= IERC20.transferFrom.selector && takerSelector <= _MAX_SELECTOR, "LOP: bad takerAssetData.selector");

        address maker = address(makerAssetData.decodeAddress(0));
        if ((signature.length != 65 && signature.length != 64) || ECDSA.recover(orderHash, signature) != maker) {
            bytes memory result = maker.uncheckedFunctionStaticCall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, orderHash, signature), "LOP: isValidSignature failed");
            require(result.length == 32 && abi.decode(result, (bytes4)) == IERC1271.isValidSignature.selector, "LOP: bad signature");
        }
    }

    function _callMakerAssetTransferFrom(address makerAsset, bytes memory makerAssetData, address taker, uint256 makingAmount) internal {
        // Patch receiver or validate private order
        address orderTakerAddress = makerAssetData.decodeAddress(1);
        if (orderTakerAddress == address(0)) {
            makerAssetData.patchAddress(1, taker);
        } else {
            require(orderTakerAddress == taker, "LOP: private order");
        }

        // Patch maker amount
        makerAssetData.patchUint256(2, makingAmount);

        // Transfer asset from maker to taker
        bytes memory result = makerAsset.uncheckedFunctionCall(makerAssetData, "LOP: makerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LOP: makerAsset.call bad result");
        }
    }

    function _callTakerAssetTransferFrom(address takerAsset, bytes memory takerAssetData, address taker, uint256 takingAmount) internal {
        // Patch spender
        takerAssetData.patchAddress(0, taker);

        // Patch taker amount
        takerAssetData.patchUint256(2, takingAmount);

        // Transfer asset from taker to maker
        bytes memory result = takerAsset.uncheckedFunctionCall(takerAssetData, "LOP: takerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LOP: takerAsset.call bad result");
        }
    }

    function _callGetMakerAmount(Order memory order, uint256 takerAmount) internal view returns(uint256 makerAmount) {
        if (order.getMakerAmount.length == 0 && takerAmount == order.takerAssetData.decodeUint256(2)) {
            // On empty order.getMakerAmount calldata only whole fills are allowed
            return order.makerAssetData.decodeUint256(2);
        }
        bytes memory result = address(this).uncheckedFunctionStaticCall(abi.encodePacked(order.getMakerAmount, takerAmount), "LOP: getMakerAmount call failed");
        require(result.length == 32, "LOP: invalid getMakerAmount ret");
        return abi.decode(result, (uint256));
    }

    function _callGetTakerAmount(Order memory order, uint256 makerAmount) internal view returns(uint256 takerAmount) {
        if (order.getTakerAmount.length == 0 && makerAmount == order.makerAssetData.decodeUint256(2)) {
            // On empty order.getTakerAmount calldata only whole fills are allowed
            return order.takerAssetData.decodeUint256(2);
        }
        bytes memory result = address(this).uncheckedFunctionStaticCall(abi.encodePacked(order.getTakerAmount, makerAmount), "LOP: getTakerAmount call failed");
        require(result.length == 32, "LOP: invalid getTakerAmount ret");
        return abi.decode(result, (uint256));
    }
}
