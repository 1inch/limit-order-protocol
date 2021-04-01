// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./utils/BytesParser.sol";
import "./utils/UnsafeAddress.sol";
import "./EIP1271.sol";
import "./SelectorFromToAmountParser.sol";


interface InteractiveTaker {
    function interact(
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 expectedTakingAmount,
        bytes memory interactiveData
    ) external;
}


contract PredicateHelper {
    using UnsafeAddress for address;

    function or(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            bytes memory result = targets[i].unsafeFunctionStaticCall(data[i], "PH: 'or' subcall failed");
            require(result.length != 32, "PH: invalid call result");
            if (abi.decode(result, (bool))) {
                return true;
            }
        }
        return false;
    }

    function and(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            bytes memory result = targets[i].unsafeFunctionStaticCall(data[i], "PH: 'and' subcall failed");
            require(result.length != 32, "PH: invalid call result");
            if (!abi.decode(result, (bool))) {
                return false;
            }
        }
        return true;
    }

    function eq(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.unsafeFunctionStaticCall(data, "PH: eq");
        return abi.decode(result, (uint256)) == value;
    }

    function lt(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.unsafeFunctionStaticCall(data, "PH: lt");
        return abi.decode(result, (uint256)) < value;
    }

    function gt(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.unsafeFunctionStaticCall(data, "PH: gt");
        return abi.decode(result, (uint256)) > value;
    }

    function arbitraryStaticCall(address target, bytes memory data) external view returns(uint256) {
        (bytes memory result) = target.unsafeFunctionStaticCall(data, "PH: arbitraryStaticCall");
        return abi.decode(result, (uint256));
    }

    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }
}


contract AmountCalculator {
    // Floor maker amount
    function getMakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) external pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    // Ceil taker amount
    function getTakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) external pure returns(uint256) {
        return (swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
    }

    function getMakerAmountNoPartialFill(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) external pure returns(uint256) {
        return (swapTakerAmount == orderTakerAmount) ? orderMakerAmount : 0;
    }

    function getTakerAmountNoPartialFill(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) external pure returns(uint256) {
        return (swapMakerAmount == orderMakerAmount) ? orderTakerAmount : 0;
    }
}


contract NonceManager {
    using Counters for Counters.Counter;

    mapping(address => Counters.Counter) private _nonces;

    function nonces(address makerAddress) external view returns(uint256) {
        return _nonces[makerAddress].current();
    }

    function advanceNonce() external {
        _nonces[msg.sender].increment();
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) external view returns(bool) {
        return _nonces[makerAddress].current() == makerNonce;
    }
}


contract ImmutableOwner {
    address public immutable immutableOwner;

    modifier onlyImmutableOwner {
        require(msg.sender == immutableOwner, "ImmutableOwner: Access denied");
        _;
    }

    constructor(address _immutableOwner) {
        immutableOwner = _immutableOwner;
    }
}

/* solhint-disable func-name-mixedcase */

abstract contract ERC20Proxy is ImmutableOwner {
    using SafeERC20 for IERC20;

    // func_0000jYAHF(address,address,uint256,address) = transferFrom + 1 = 0x8d076e86
    function func_0000jYAHF(address from, address to, uint256 amount, IERC20 token) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, amount);
    }
}


abstract contract ERC721Proxy is ImmutableOwner {
    // func_4002L9TKH(address,address,uint256,address) = transferFrom + 2 = 0x8d076e87
    function func_4002L9TKH(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.transferFrom(from, to, tokenId);
    }

    // func_2000nVqcj(address,address,uint256,address) == transferFrom + 3 = 0x8d076e88
    function func_2000nVqcj(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId);
    }
}


abstract contract ERC1155Proxy is ImmutableOwner {
    // func_7000ksXmS(address,address,uint256,address,uint256) == transferFrom + 4 = 0x8d076e89
    function func_7000ksXmS(address from, address to, uint256 amount, IERC1155 token, uint256 tokenId) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId, amount, "");
    }
}

/* solhint-enable func-name-mixedcase */

contract LimitSwap is
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
    using BytesParser for bytes;
    using UnsafeAddress for address;
    using SelectorFromToAmountParser for bytes;

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

    bytes32 constant public LIMIT_SWAP_ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData,bytes getMakerAmount,bytes getTakerAmount,bytes predicate,bytes permitData)"
    );

    bytes32 constant public LIMIT_SWAP_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ(uint256 info,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData)"
    );

    mapping(bytes32 => uint256) private _remaining;
    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns(bytes32) {
        return _domainSeparatorV4();
    }

    function remaining(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash].sub(1, "LS: Unknown order");
    }

    function remainingRaw(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash];
    }

    function validNonce(address maker, uint256 nonce) external view returns(bool) {
        return _invalidator[maker][uint64(nonce) / 256] & (1 << (nonce % 256)) == 0;
    }

    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory results) {
        results = new uint256[](orderHashes.length);
        for (uint i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
    }

    function checkPredicate(Order memory order) public view returns(bool) {
        bytes memory result = address(this).unsafeFunctionStaticCall(order.predicate, "LS: predicate call failed");
        require(result.length == 32, "LS: invalid predicate return");
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
        require(order.makerAssetData.getArgumentFrom() == msg.sender, "LS: Access denied");

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
        require(expiration == 0 || block.timestamp <= expiration, "LS: order expired");  // solhint-disable-line not-rely-on-time

        // Validate double spend
        address maker = order.makerAssetData.getArgumentFrom();
        uint256 invalidator = _invalidator[maker][uint64(order.info) / 256];
        require(invalidator & (1 << (order.info % 256)) == 0, "LS: already filled");
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
            remainingMakerAmount = order.makerAssetData.getArgumentAmount();
            if (order.permitData.length > 0) {
                (address token, bytes memory permitData) = abi.decode(order.permitData, (address, bytes));
                token.unsafeFunctionCall(abi.encodePacked(IERC20Permit.permit.selector, permitData), "LS: permit failed");
            }
        }

        // Check is order is valid
        if (order.predicate.length > 0) {
            require(checkPredicate(order), "LS: predicate returned false");
        }

        // Compute maker and taket assets amount
        if (makingAmount >> 255 == 1) {
            makingAmount = remainingMakerAmount;
        }
        if (takingAmount == 0) {
            takingAmount = (makingAmount == order.makerAssetData.getArgumentAmount())
                ? order.takerAssetData.getArgumentAmount()
                : _callGetTakerAmount(order, makingAmount);
        }
        else if (makingAmount == 0) {
            makingAmount = (takingAmount == order.takerAssetData.getArgumentAmount())
                ? order.makerAssetData.getArgumentAmount()
                : _callGetMakerAmount(order, takingAmount);
        }
        else {
            revert("LS: one of amounts should be 0");
        }

        require(makingAmount > 0 && takingAmount > 0, "LS: can't swap 0 amount");

        // Update remaining amount in storage
        remainingMakerAmount = remainingMakerAmount.sub(makingAmount, "LS: taking > remaining");
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
                    LIMIT_SWAP_ORDER_TYPEHASH,
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
                    LIMIT_SWAP_ORDER_RFQ_TYPEHASH,
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
        require(makerAssetData.length >= 68, "LS: bad makerAssetData.length");
        require(takerAssetData.length >= 68, "LS: bad takerAssetData.length");
        bytes4 makerSelector = makerAssetData.getArgumentSelector();
        bytes4 takerSelector = takerAssetData.getArgumentSelector();
        require(makerSelector >= IERC20.transferFrom.selector && makerSelector <= bytes4(uint32(IERC20.transferFrom.selector) + 10), "LS: bad makerAssetData.selector");
        require(takerSelector >= IERC20.transferFrom.selector && takerSelector <= bytes4(uint32(IERC20.transferFrom.selector) + 10), "LS: bad takerAssetData.selector");

        address maker = address(makerAssetData.getArgumentFrom());
        if (signature.length != 65 || ECDSA.recover(orderHash, signature) != maker) {
            require(IEIP1271(maker).isValidSignature(orderHash, signature) == EIP1271Constants._MAGIC_VALUE, "LS: bad signature");
        }
    }

    function _callMakerAssetTransferFrom(address makerAsset, bytes memory makerAssetData, address taker, uint256 makingAmount) internal {
        // Patch receiver or validate private order
        address takerAddress = makerAssetData.getArgumentTo();
        if (takerAddress == address(0)) {
            makerAssetData.patchBytes32(4 + 32, bytes32(uint256(uint160(taker))));
        } else {
            require(takerAddress == taker, "LS: private order");
        }

        // Patch amount if needed
        if (makingAmount != type(uint256).max) {
            makerAssetData.patchBytes32(4 + 32 + 32, bytes32(makingAmount));
        }

        // Transfer asset from maker to taker
        bytes memory result = makerAsset.unsafeFunctionCall(makerAssetData, "LS: makerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LS: makerAsset.call wrong result");
        }
    }

    function _callTakerAssetTransferFrom(address takerAsset, bytes memory takerAssetData, address taker, uint256 takingAmount) internal {
        // Patch spender
        takerAssetData.patchBytes32(4, bytes32(uint256(uint160(taker))));

        // Patch amount if needed
        if (takingAmount != type(uint256).max) {
            takerAssetData.patchBytes32(4 + 32 + 32, bytes32(takingAmount));
        }

        // Transfer asset from taker to maker
        bytes memory result = takerAsset.unsafeFunctionCall(takerAssetData, "LS: takerAsset.call failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LS: takerAsset.call wrong result");
        }
    }

    function _callGetMakerAmount(Order memory order, uint256 takerAmount) internal view returns(uint256 makerAmount) {
        bytes memory result = address(this).unsafeFunctionStaticCall(abi.encodePacked(order.getMakerAmount, takerAmount), "LS: getMakerAmount call failed");
        return abi.decode(result, (uint256));
    }

    function _callGetTakerAmount(Order memory order, uint256 makerAmount) internal view returns(uint256 takerAmount) {
        bytes memory result = address(this).unsafeFunctionStaticCall(abi.encodePacked(order.getTakerAmount, makerAmount), "LS: getTakerAmount call failed");
        return abi.decode(result, (uint256));
    }
}
