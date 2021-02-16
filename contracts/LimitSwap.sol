pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


interface InteractiveTaker {
    function interact(
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 takingAmount,
        uint256 expectedAmount
    ) external;
}

contract PredicateHelper {
    function or(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            try targets[i].staticcall(data[i]) returns(bool result) {
                if (result) {
                    return true;
                }
            }
            catch {
                return false;
            }
        }
    }

    function and(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            try targets[i].staticcall(data[i]) returns(bool result) {
                if (!result) {
                    return false;
                }
            }
            catch {
                return false;
            }
        }
        return true;
    }

    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;
    }
}


contract GetTakerAmountHelper {
    using SafeMath for uint256;

    function disablePartialFill(uint256 makerAmount, uint256 remainingMakerAmount) external view returns(uint256) {
        return (makerAmount == remainingMakerAmount) ? makerAmount : 0;
    }

    function getPropotionalAmount(uint256 makerAmount, uint256 takerAmount, uint256 remainingMakerAmount) external view returns(uint256) {
        return remainingMakerAmount.mul(takerAmount).div(makerAmount);
    }
}


contract LimitOrder {
    // Partial Fill:
    //   getTakerAmount := GetTakerAmountHelper.disablePartialFill(makerAmount, ...)
    //
    // Expiration Mask:
    //   predicate := PredicateHelper.timestampBelow(deadline)
    //
    // Maker Nonce:
    //   predicate := this.nonceEquals(makerAddress, makerNonce)

    struct Data {
        address makerAsset;
        address takerAsset;
        bytes makerAssetData; // (transferFrom.selector, signer, ______, makerAmount, ...)
        bytes takerAssetData; // (transferFrom.selector, sender, signer, takerAmount, ...)
        bytes getTakerAmount; // (address, abi.encodePacked(bytes, remainingMakerAmount)) => (requiredTakerAmount)
        bytes predicate;      // (adress, bytes) => (bool)
        bytes permit;         // On first fill: makerAsset.call(permit)
        bytes signature;
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) {
        return nonces[makerAddress] == makerNonce;
    }

    function hash(Data memory order, address contractAddress) internal pure returns(bytes32) {
        // TODO: add magic values into hash, look for eip for this
        return keccak256(abi.encodePacked(
            contractAddress,
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.expiration,
            order.makerAmount,
            order.takerAmount
        ));
    }

    function isValidSignature(Data memory order, bytes32 orderHash) internal pure returns(bool) {
        if (Address.isContract(order.makerAddress)) {
            return IEIP1271(order.makerAddress).isValidSignature(orderHash, order.signature);
        }
        if (order.signature.length > 0) {
            return (ECDSA.recover(orderHash, order.signature) == order.makerAddress);
        }
        return (order.makerAddress == msg.sender);
    }

    function emitUpdate(Data memory order, uint256 remaining) internal {
        emit LimitOrderUpdated(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.expiration,
            order.makerAmount,
            order.takerAmount,
            remaining
        );
    }
}


contract LimitSwap is IEIP1271 {
    using SafeERC20 for IERC20;
    using LimitOrder for LimitOrder.Data;

    mapping(bytes32 => uint256) private _remaining;

    function remaining(bytes32 orderHash) public view returns(uint256) {
        return _remaining[orderHash].sub(1, "IDK");
    }

    function remainingForOrder(LimitOrder.Data memory order) public view returns(uint256) {
        bytes32 orderHash = order.hash(address(this));
        uint256 preResult = _remaining[orderHash];
        if (preResult == 0) {
            return order.makerAmount;
        }
        return preResult.sub(1, "IDK");
    }

    function multiRemainingForOrders(LimitOrder.Data[] memory orders) external view returns(uint256[] memory results) {
        results = new uint256[](orders.length);
        for (uint i = 0; i < orders.length; i++) {
            results[i] = remainingForOrder(orderHashes[i]);
        }
    }

    function postOrder(LimitOrder.Data memory order) external {
        bytes32 orderHash = order.hash();
        require(remaining[orderHash]._raw == 0, "LimitSwap: order already exist");
        require(order.isValidSignature(orderHash), "LimitSwap: isValidSignature failed");

        remaining[orderHash] = order.makerAmount;
        order.updateOrder(order.makerAmount);
    }

    function cancelOrder(LimitOrder.Data memory order) external {
        require(order.makerAddress == msg.sender, "LimitSwap: Access denied");

        bytes32 orderHash = order.hash(address(this));
        require(remaining[orderHash] != 0, "LimitSwap: not existing or already filled order");
        remaining[orderHash] = 0;
        order.updateOrder(0);
    }

    function sellOrder(LimitOrder.Data calldata order, uint256 makingAmount, bool interactive) external {
        buyOrder(order, makingAmount.mul(order.takerAmount).div(order.makerAmount), interactive);
    }

    function buyOrder(LimitOrder.Data calldata order, uint256 takingAmount, bool interactive) external {
        require(block.timestamp <= expiration, "LimitSwap: order already expired");
        require(takerAddress == address(0) || takerAddress == msg.sender, "LimitSwap: private order");

        bytes32 orderHash = order.hash(address(this));
        uint256 remaining = remaining[orderHash].sub(takingAmount, "LimitSwap: remaining amount is less than taking amount");
        remaining[orderHash] = remaining;
        order.updateOrder(orderHash, remaining);

        // Maker => Taker
        makerAsset.safeTransferFrom(makerAddress, msg.sender, takingAmount);

        // Taker can handle funds interactively
        uint256 expectedAmount = takingAmount.mul(order.makerAmount).div(order.takerAmount);
        if (interactive) {
            InteractiveTaker(msg.sender).interact(makerAsset, takerAsset, takingAmount, expectedAmount);
        }

        // Taker => Maker
        takerAsset.safeTransferFrom(msg.sender, makerAddress, expectedAmount);
    }
}
