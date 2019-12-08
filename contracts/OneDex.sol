pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract InteractiveTaker {
    function interact(
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 takingAmount,
        uint256 expectedAmount
    ) external;
}


library LimitOrder {
    struct Data {
        address makerAddress;
        address takerAddress;
        IERC20 makerAsset;
        IERC20 takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 expiration;
    }

    function hash(Data memory order) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            order.expiration
        ));
    }
}


contract OneDex {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using LimitOrder for LimitOrder.Data;

    mapping(bytes32 => uint256) public remainings;
    mapping(bytes32 => bool) public invalidated;

    event LimitOrderUpdated(
        address indexed makerAddress,
        address indexed takerAddress,
        IERC20 indexed makerAsset,
        IERC20 indexed takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 remaining
    ) anonymous;

    function available(
        address makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    ) public view returns(uint256) {
        if (expiration < now) {
            return 0;
        }

        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: makerAddress,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        return Math.min(
            remainings[order.hash()],
            Math.min(
                makerAsset.balanceOf(makerAddress),
                makerAsset.allowance(makerAddress, address(this))
            )
        );
    }

    function makeOrder(
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    ) public payable {
        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: msg.sender,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        require(remainings[orderHash] == 0, "OneDex: existing order");

        if (makerAsset == IERC20(0)) {
            require(makerAmount == msg.value, "OneDex: for ETH makerAmount should be equal to msg.value");
        }

        _updateOrder(order, orderHash, makerAmount);
    }

    function cancelOrder(
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    ) public {
        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: msg.sender,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        require(remainings[orderHash] != 0, "OneDex: not existing or already filled order");

        if (makerAsset == IERC20(0)) {
            require(msg.sender.send(remainings[orderHash]), "OneDex: maker should receive ETH when cancel ETH order");
        }

        _updateOrder(order, orderHash, 0);
    }

    function takeOrderAvailable(
        address payable makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 takingAmount,
        bool interactive
    ) public payable {
        uint256 volume = Math.min(
            takingAmount,
            available(
                makerAddress,
                takerAddress,
                makerAsset,
                takerAsset,
                makerAmount,
                takerAmount,
                expiration
            )
        );
        takeOrder(
            makerAddress,
            takerAddress,
            makerAsset,
            takerAsset,
            makerAmount,
            takerAmount,
            expiration,
            volume,
            interactive
        );
    }

    function takeOrder(
        address payable makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 takingAmount,
        bool interactive
    ) public payable {
        require(block.timestamp <= expiration, "OneDex: order already expired");
        require(takerAddress == address(0) || takerAddress == msg.sender, "OneDex: access denied to this order");

        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: makerAddress,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        _updateOrder(order, orderHash, remainings[orderHash].sub(takingAmount, "OneDex: remaining amount is less than taking amount"));

        // Maker => Taker
        if (makerAsset == IERC20(0)) {
            msg.sender.transfer(takingAmount);
        } else {
            makerAsset.safeTransferFrom(makerAddress, msg.sender, takingAmount);
        }

        // Taker can handle funds interactively
        uint256 expectedAmount = takingAmount.mul(makerAmount).div(takerAmount);
        if (interactive) {
            InteractiveTaker(msg.sender).interact(makerAsset, takerAsset, takingAmount, expectedAmount);
        }

        // Taker => Maker
        if (takerAsset == IERC20(0)) {
            require(takingAmount == msg.value, "OneDex: for ETH takingAmount should be equal to msg.value");
            makerAddress.transfer(takingAmount);
        } else {
            takerAsset.safeTransferFrom(msg.sender, makerAddress, expectedAmount);
        }
    }

    function _updateOrder(LimitOrder.Data memory order, bytes32 orderHash, uint256 remainingAmount) internal {
        if (remainings[orderHash] != remainingAmount) {
            if (remainings[orderHash] == 0 && remainingAmount > 0) {
                require(!invalidated[orderHash], "OneDex: order was already used");
                invalidated[orderHash] = true;
            }
            remainings[orderHash] = remainingAmount;
        }

        emit LimitOrderUpdated(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            order.expiration,
            remainingAmount
        );
    }
}
