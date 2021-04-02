// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

import "./helpers/PredicateHelper.sol";
import "./helpers/AmountCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/ERC20Proxy.sol";
import "./helpers/ERC721Proxy.sol";
import "./helpers/ERC1155Proxy.sol";
import "./interfaces/IEIP1271.sol";
import "./interfaces/InteractiveTaker.sol";
import "./libraries/EIP1271Constants.sol";
import "./libraries/UnsafeAddress.sol";
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
    using UnsafeAddress for address;
    using ArgumentsDecoder for bytes;

    // Partial Fill:
    //   getMakerAmount := GetMakerAmountHelper.disablePartialFill(makerAmount, ...)
    //
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
        bytes permitData;     // On first fill: permitData.1.call(abi.encodePacked(permit.selector, permitData.2))
    }

    bytes32 constant public LIMIT_ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData,bytes getMakerAmount,bytes getTakerAmount,bytes predicate,bytes permitData)"
    );

    bytes32 constant public LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ(uint256 info,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData)"
    );

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
        bytes memory result = address(this).unsafeFunctionStaticCall(order.predicate, "LOP: predicate call failed");
        require(result.length == 32, "LOP: invalid predicate return");
        return abi.decode(result, (bool));
    }

    function simulateTransferFroms(IERC20[] calldata tokens, bytes[] calldata data) external {
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
        revert(string(abi.encodePacked("TRANSFERS_SUCCESSFUL_", reason)));
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

    function fillOrderRFQ(OrderRFQ memory order, bytes memory signature) external {
        // Check time expiration
        uint256 expiration = uint128(order.info) >> 64;
        require(expiration == 0 || block.timestamp <= expiration, "LOP: order expired");  // solhint-disable-line not-rely-on-time

        // Validate double spend
        address maker = order.makerAssetData.decodeAddress(0);
        uint256 invalidator = _invalidator[maker][uint64(order.info) / 256];
        require(invalidator & (1 << (order.info % 256)) == 0, "LOP: already filled");
        _invalidator[maker][uint64(order.info) / 256] = invalidator | (1 << (order.info % 256));

        // Validate
        _validate(order, signature, _hash(order));

        // Maker => Taker, Taker => Maker
        _callMakerAssetTransferFrom(order.makerAsset, order.makerAssetData, msg.sender, type(uint256).max);
        _callTakerAssetTransferFrom(order.takerAsset, order.takerAssetData, msg.sender, type(uint256).max);
    }

    function fillOrder(
        Order memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external returns(uint256, uint256) {
        bytes32 orderHash = _hash(order);

        (bool orderExists, uint256 remainingMakerAmount) = _remaining[orderHash].trySub(1);
        if (!orderExists) {
            // First fill: validate order and permit maker asset
            _validate(order, signature, orderHash);
            remainingMakerAmount = order.makerAssetData.decodeUint256(2);
            if (order.permitData.length > 0) {
                (address token, bytes memory permitData) = abi.decode(order.permitData, (address, bytes));
                token.unsafeFunctionCall(abi.encodePacked(IERC20Permit.permit.selector, permitData), "LOP: permit failed");
            }
        }

        // Check is order is valid
        if (order.predicate.length > 0) {
            require(checkPredicate(order), "LOP: predicate returned false");
        }

        // Compute maker and taket assets amount
        if (makingAmount >> 255 == 1) {
            makingAmount = remainingMakerAmount;
        }
        if (takingAmount == 0) {
            takingAmount = (makingAmount == order.makerAssetData.decodeUint256(2))
                ? order.takerAssetData.decodeUint256(2)
                : _callGetTakerAmount(order, makingAmount);
        }
        else if (makingAmount == 0) {
            makingAmount = (takingAmount == order.takerAssetData.decodeUint256(2))
                ? order.makerAssetData.decodeUint256(2)
                : _callGetMakerAmount(order, takingAmount);
        }
        else {
            revert("LOP: one of amounts should be 0");
        }

        require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");

        // Update remaining amount in storage
        remainingMakerAmount = remainingMakerAmount.sub(makingAmount, "LOP: taking > remaining");
        _remaining[orderHash] = remainingMakerAmount + 1;
        emit OrderFilled(msg.sender, orderHash, remainingMakerAmount);

        // Maker => Taker
        _callMakerAssetTransferFrom(order.makerAsset, order.makerAssetData, msg.sender, makingAmount);

        // Taker can handle funds interactively
        if (interactiveData.length > 0) {
            InteractiveTaker(msg.sender).interact(order.makerAsset, order.takerAsset, makingAmount, takingAmount, interactiveData);
        }

        // Taker => Maker
        _callTakerAssetTransferFrom(order.takerAsset, order.takerAssetData, msg.sender, takingAmount);

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
                    keccak256(order.permitData)
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
        return _validate(order.makerAssetData, order.takerAssetData, signature, orderHash);
    }

    function _validate(OrderRFQ memory order, bytes memory signature, bytes32 orderHash) internal view {
        return _validate(order.makerAssetData, order.takerAssetData, signature, orderHash);
    }

    function _validate(bytes memory makerAssetData, bytes memory takerAssetData, bytes memory signature, bytes32 orderHash) internal view {
        require(makerAssetData.length >= 100, "LOP: bad makerAssetData.length");
        require(takerAssetData.length >= 100, "LOP: bad takerAssetData.length");
        bytes4 makerSelector = makerAssetData.decodeSelector();
        bytes4 takerSelector = takerAssetData.decodeSelector();
        require(makerSelector >= IERC20.transferFrom.selector && makerSelector <= bytes4(uint32(IERC20.transferFrom.selector) + 10), "LOP: bad makerAssetData.selector");
        require(takerSelector >= IERC20.transferFrom.selector && takerSelector <= bytes4(uint32(IERC20.transferFrom.selector) + 10), "LOP: bad takerAssetData.selector");

        address maker = address(makerAssetData.decodeAddress(0));
        if (signature.length != 65 || ECDSA.recover(orderHash, signature) != maker) {
            require(IEIP1271(maker).isValidSignature(orderHash, signature) == EIP1271Constants._MAGIC_VALUE, "LOP: bad signature");
        }
    }

    function _callMakerAssetTransferFrom(address makerAsset, bytes memory makerAssetData, address taker, uint256 makingAmount) internal {
        // Patch receiver or validate private order
        address takerAddress = makerAssetData.decodeAddress(1);
        if (takerAddress == address(0)) {
            makerAssetData.patchAddress(1, taker);
        } else {
            require(takerAddress == taker, "LOP: private order");
        }

        // Patch amount if needed
        if (makingAmount != type(uint256).max) {
            makerAssetData.patchUint256(2, makingAmount);
        }

        // Transfer asset from maker to taker
        bytes memory result = makerAsset.unsafeFunctionCall(makerAssetData, "LOP: makerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LOP: makerAsset.call bad result");
        }
    }

    function _callTakerAssetTransferFrom(address takerAsset, bytes memory takerAssetData, address taker, uint256 takingAmount) internal {
        // Patch spender
        takerAssetData.patchAddress(0, taker);

        // Patch amount if needed
        if (takingAmount != type(uint256).max) {
            takerAssetData.patchUint256(2, takingAmount);
        }

        // Transfer asset from taker to maker
        bytes memory result = takerAsset.unsafeFunctionCall(takerAssetData, "LOP: takerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LOP: takerAsset.call bad result");
        }
    }

    function _callGetMakerAmount(Order memory order, uint256 takerAmount) internal view returns(uint256 makerAmount) {
        bytes memory result = address(this).unsafeFunctionStaticCall(abi.encodePacked(order.getMakerAmount, takerAmount), "LOP: getMakerAmount call failed");
        return abi.decode(result, (uint256));
    }

    function _callGetTakerAmount(Order memory order, uint256 makerAmount) internal view returns(uint256 takerAmount) {
        bytes memory result = address(this).unsafeFunctionStaticCall(abi.encodePacked(order.getTakerAmount, makerAmount), "LOP: getTakerAmount call failed");
        return abi.decode(result, (uint256));
    }
}
