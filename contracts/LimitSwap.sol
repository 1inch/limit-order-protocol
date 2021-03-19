// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./EIP1271.sol";


interface InteractiveTaker {
    function interact(
        address makerAsset,
        address takerAsset,
        uint256 takingAmount,
        uint256 expectedAmount
    ) external;
}

contract PredicateHelper {
    function or(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].staticcall(data[i]);
            if (!success) {
                return false;
            }
            if (result.length == 32 && abi.decode(result, (bool))) {
                return true;
            }
        }
        return false;
    }

    function and(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].staticcall(data[i]);
            if (!success) {
                return false;
            }
            if (result.length == 32 && !abi.decode(result, (bool))) {
                return false;
            }
        }
        return true;
    }

    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;
    }
}


contract GetMakerAmountHelper {
    using SafeMath for uint256;

    function disablePartialFill(uint256 makerAmount, uint256 remainingMakerAmount) external pure returns(uint256) {
        return (makerAmount == remainingMakerAmount) ? makerAmount : 0;
    }

    // Floor maker amount
    function getMakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) external pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    // Ceil taker amount
    function getTakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) external pure returns(uint256) {
        return (swapMakerAmount * orderMakerAmount + orderTakerAmount - 1) / orderTakerAmount;
    }
}


contract NonceManager {
    mapping(address => uint256) public nonces;

    function advanceNonce() external {
        nonces[msg.sender]++;
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) external view returns(bool) {
        return nonces[makerAddress] == makerNonce;
    }
}

library ArrayParser {
    function sliceBytes32(bytes memory data, uint256 start) internal pure returns(bytes32 result) {
        assembly {
            result := mload(add(add(data, 0x20), start))
        }
    }

    function patchBytes32(bytes memory data, uint256 start, bytes32 value) internal pure returns(bytes memory result) {
        assembly {
            mstore(add(add(data, 0x20), start), value)
        }
        return data;
    }
}


library SelectorFromToAmountParser {
    using ArrayParser for bytes;

    function getDataSelector(bytes memory data) internal pure returns(bytes4) {
        return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    }

    function getDataFrom(bytes memory data) internal pure returns(address) {
        return address(uint160(uint256(data.sliceBytes32(4))));
    }

    function getDataTo(bytes memory data) internal pure returns(address) {
        return address(uint160(uint256(data.sliceBytes32(36))));
    }

    function getDataAmount(bytes memory data) internal pure returns(uint256) {
        return uint256(data.sliceBytes32(68));
    }
}

contract ERC20Proxy {
    using SafeERC20 for IERC20;

    // func_0000jYAHF(address,address,uint256,address) = transferFrom + 1 = 0x8d076e86
    function func_0000jYAHF(address from, address to, uint256 amount, IERC20 token) external {
        token.safeTransferFrom(from, to, amount);
    }
}

contract ERC721Proxy {
    using SafeERC20 for IERC20;

    // func_4002L9TKH(address,address,uint256,address) = transferFrom + 2 = 0x8d076e87
    function func_4002L9TKH(address from, address to, uint256 tokenId, IERC721 token) external {
        token.transferFrom(from, to, tokenId);
    }

    // func_2000nVqcj(address,address,uint256,address) == transferFrom + 3 = 0x8d076e88
    function func_2000nVqcj(address from, address to, uint256 tokenId, IERC721 token) external {
        token.safeTransferFrom(from, to, tokenId);
    }
}

contract ERC1155Proxy {
    using SafeERC20 for IERC20;

    // func_7000ksXmS(address,address,uint256,address,uint256) == transferFrom + 4 = 0x8d076e89
    function func_7000ksXmS(address from, address to, uint256 amount, IERC1155 token, uint256 tokenId) external {
        token.safeTransferFrom(from, to, tokenId, amount, "");
    }
}


contract LimitSwap is EIP712("1inch Limit Order Protocol", "1"), NonceManager, GetMakerAmountHelper, PredicateHelper {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using ArrayParser for bytes;
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
        bytes32 indexed orderHash,
        address indexed makerAddress,
        uint256 remaining
    );

    struct Order {
        address makerAsset;
        address takerAsset;
        bytes makerAssetData; // (transferFrom.selector, signer, ______, makerAmount, ...)
        bytes takerAssetData; // (transferFrom.selector, sender, signer, takerAmount, ...)
        bytes getMakerAmount; // (address, abi.encodePacked(bytes, swapTakerAmount)) => (swapMakerAmount)
        bytes getTakerAmount; // (address, abi.encodePacked(bytes, swapMakerAmount)) => (swapTakerAmount)
        bytes predicate;      // (adress, bytes) => (bool)
        bytes permitData;     // On first fill: permitData.1.call(abi.encodePacked(permit.selector, permitData.2))
        bytes signature;
    }

    bytes32 constant public _LIMIT_SWAP_ORDER_TYPEHASH = keccak256(
        "Order("
        "address makerAsset,"
        "address takerAsset,"
        "bytes makerAssetData,"
        "bytes takerAssetData,"
        "bytes getMakerAmount,"
        "bytes getTakerAmount,"
        "bytes predicate,"
        "bytes permitData,"
        "bytes signature,"
        ")"
    );

    mapping(bytes32 => uint256) private _remaining;

    function remaining(bytes32 orderHash) public view returns(uint256) {
        return _remaining[orderHash].sub(1, "LimitSwap: Unknown order");
    }

    function remainingRaw(bytes32 orderHash) public view returns(uint256) {
        return _remaining[orderHash];
    }

    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory results) {
        results = new uint256[](orderHashes.length);
        for (uint i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
    }

    function simulateTransferFroms(IERC20[] calldata tokens, bytes[] calldata data) external {
        bytes memory reason = new bytes(tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            (bool success, bytes memory result) = address(tokens[i]).call(data[i]);
            if (success && result.length > 0) {
                success = abi.decode(result, (bool));
            }
            reason[i] = bytes(success ? "1" : "0")[0];
        }

        // Always revert and provide per call results
        revert(string(abi.encodePacked("TRANSFERS_SUCCESSFUL_", reason)));
    }

    function cancelOrder(Order memory order) external {
        require(order.makerAssetData.getDataFrom() == msg.sender, "LimitSwap: Access denied");

        bytes32 orderHash = _hash(order);
        _remaining[orderHash] = 1;
        _updateOrder(orderHash, msg.sender, 0);
    }

    function fillOrder(
        Order calldata order,
        uint256 takingAmount,
        uint256 makingAmount,
        bool interactive,
        bytes memory permitTakerAsset
    ) public {
        bytes32 orderHash = _hash(order);
        (bool orderExists, uint256 remainingMakerAmount) = _remaining[orderHash].trySub(1);
        if (!orderExists) {
            // First fill: validate order and permit maker asset
            _validate(order, orderHash);
            remainingMakerAmount = order.makerAssetData.getDataAmount();
            if (order.permitData.length > 0) {
                (address token, bytes memory permitData) = abi.decode(order.permitData, (address, bytes));
                token.functionCall(abi.encodePacked(IERC20Permit.permit.selector, permitData), "LimitSwap: permit failed");
            }
        }

        // Compute maker and taket assets amount
        if (makingAmount >> 255 == 1) {
            makingAmount = remainingMakerAmount;
        }
        if (takingAmount == 0) {
            takingAmount = _callGetTakerAmount(order, makingAmount);
        }
        else if (makingAmount == 0) {
            makingAmount = _callGetMakerAmount(order, takingAmount);
        }
        else {
            revert("LimitSwap: takingAmount or makingAmount should be 0");
        }

        require(makingAmount > 0 || takingAmount > 0, "LimitSwap: can't swap 0 amount");

        // Update remaining amount in storage
        remainingMakerAmount = remainingMakerAmount.sub(makingAmount, "LimitSwap: taking > remaining");
        _remaining[orderHash] = remainingMakerAmount + 1;
        _updateOrder(orderHash, msg.sender, remainingMakerAmount);

        // Maker => Taker
        _callMakerAssetTransferFrom(order, msg.sender, takingAmount);

        // Taker can handle funds interactively
        if (interactive) {
            InteractiveTaker(msg.sender).interact(order.makerAsset, order.takerAsset, makingAmount, takingAmount);
        }

        // Taker => Maker
        _callTakerAssetTransferFrom(order, msg.sender, takingAmount, permitTakerAsset);
    }

    function _hash(Order memory order) internal view returns(bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encodePacked(
                _LIMIT_SWAP_ORDER_TYPEHASH,
                order.makerAsset,
                order.takerAsset,
                keccak256(order.makerAssetData),
                keccak256(order.takerAssetData),
                keccak256(order.getMakerAmount),
                keccak256(order.getTakerAmount),
                keccak256(order.predicate),
                keccak256(order.permitData),
                keccak256(order.signature)
            ))
        );
    }

    function _validate(Order memory order, bytes32 orderHash) internal view {
        bytes4 selector = order.makerAssetData.getDataSelector();
        require(selector >= IERC20.transferFrom.selector && selector <= bytes4(uint32(IERC20.transferFrom.selector) + 10), "LimitSwap: Invalid makerAssetData.selector");
        require(address(order.makerAssetData.getDataFrom()) == order.makerAsset, "LimitSwap: Invalid makerAssetData.from");

        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(orderHash);
        if (Address.isContract(order.makerAsset)) {
            require(IEIP1271(order.makerAsset).isValidSignature(ethSignedMessageHash, order.signature) == EIP1271Constants.MAGIC_VALUE, "LimitSwap: Invalid signature");
        }
        else if (order.signature.length > 0) {
            require(ECDSA.recover(ethSignedMessageHash, order.signature) == order.makerAsset, "LimitSwap: Invalid signature");
        }
    }

    function _callMakerAssetTransferFrom(Order memory order, address taker, uint256 takerAmount) internal {
        // Patch receiver or validate private order
        address takerAddress = order.makerAssetData.getDataTo();
        if (takerAddress == address(0)) {
            order.makerAssetData.patchBytes32(4 + 32, bytes32(uint256(uint160(taker))));
        } else {
            require(takerAddress == taker, "LimitSwap: private order");
        }

        // Patch amount
        uint256 makingAmount = _callGetMakerAmount(order, takerAmount);
        order.makerAssetData.patchBytes32(4 + 32 + 32, bytes32(makingAmount));

        // Transfer asset from maker to taker
        bytes memory result = address(order.makerAsset).functionCall(order.makerAssetData, "LimitSwap: makerAsset.call() failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LimitSwap: makerAsset.call() wrong result");
        }
    }

    function _callTakerAssetTransferFrom(Order memory order, address taker, uint256 takingAmount, bytes memory permitTakerAsset) internal {
        // Patch spender
        order.takerAssetData.patchBytes32(4, bytes32(uint256(uint160(taker))));

        // Patch amount
        order.takerAssetData.patchBytes32(4 + 32 + 32, bytes32(takingAmount));

        // Taker asset permit
        if (permitTakerAsset.length > 0) {
            order.takerAsset.functionCall(abi.encodePacked(IERC20Permit.permit.selector, permitTakerAsset), "LimitSwap: permit failed");
        }

        // Transfer asset from taker to maker
        bytes memory result = address(order.takerAsset).functionCall(order.takerAssetData, "LimitSwap: takerAsset.call() failed");
        if (result.length > 0) {
            require(abi.decode(result, (bool)), "LimitSwap: takerAsset.call() wrong result");
        }
    }

    function _callGetMakerAmount(Order memory order, uint256 takerAmount) internal view returns(uint256 makerAmount) {
        (address target, bytes memory data) = abi.decode(order.getMakerAmount, (address, bytes));
        bytes memory result = target.functionStaticCall(abi.encodePacked(data, takerAmount), "LimitSwap: getMakerAmount call failed");
        return abi.decode(result, (uint256));
    }

    function _callGetTakerAmount(Order memory order, uint256 makerAmount) internal view returns(uint256 takerAmount) {
        (address target, bytes memory data) = abi.decode(order.getTakerAmount, (address, bytes));
        bytes memory result = target.functionStaticCall(abi.encodePacked(data, makerAmount), "LimitSwap: getTakerAmount call failed");
        return abi.decode(result, (uint256));
    }

    function _updateOrder(bytes32 orderHash, address maker, uint256 remainingAmount) internal {
        emit OrderFilled(orderHash, maker, remainingAmount);
    }
}
