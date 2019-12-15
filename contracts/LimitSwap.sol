pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
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


contract Depositor {

    using SafeMath for uint256;

    mapping(address => uint256) private _balances;

    function balanceOf(address user) public view returns(uint256) {
        return _balances[user];
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public payable {
        _burn(msg.sender, amount);
        msg.sender.transfer(amount);
    }

    function _mint(address user, uint256 amount) internal {
        _balances[user] = _balances[user].add(amount);
    }

    function _burn(address user, uint256 amount) internal {
        _balances[user] = _balances[user].sub(amount);
    }
}


contract LimitSwap is Depositor {

    using SafeERC20 for IERC20;
    using LimitOrder for LimitOrder.Data;

    mapping(bytes32 => uint256) public remainings;

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
        require(remainings[orderHash] == 0, "LimitSwap: existing order");

        if (makerAsset == IERC20(0)) {
            require(makerAmount == msg.value, "LimitSwap: for ETH makerAmount should be equal to msg.value");
            deposit();
        } else {
            require(msg.value == 0, "LimitSwap: msg.value should be 0 when makerAsset in not ETH");
        }

        remainings[orderHash] = makerAmount;
        _updateOrder(order, orderHash);
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
        require(remainings[orderHash] != 0, "LimitSwap: not existing or already filled order");

        if (makerAsset == IERC20(0)) {
            withdraw(remainings[orderHash]);
        }

        remainings[orderHash] = 0;
        _updateOrder(order, orderHash);
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
        require(block.timestamp <= expiration, "LimitSwap: order already expired");
        require(takerAddress == address(0) || takerAddress == msg.sender, "LimitSwap: access denied to this order");

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
        remainings[orderHash] = remainings[orderHash].sub(takingAmount, "LimitSwap: remaining amount is less than taking amount");
        _updateOrder(order, orderHash);

        // Maker => Taker
        if (makerAsset == IERC20(0)) {
            _burn(makerAddress, takingAmount);
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
            if (msg.value > 0) {
                deposit();
            }
            _burn(msg.sender, expectedAmount);
            makerAddress.transfer(expectedAmount);
        } else {
            require(msg.value == 0, "LimitSwap: msg.value should be 0 when takerAsset in not ETH");
            takerAsset.safeTransferFrom(msg.sender, makerAddress, expectedAmount);
        }
    }

    function _updateOrder(LimitOrder.Data memory order, bytes32 orderHash) internal {
        emit LimitOrderUpdated(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            order.expiration,
            remainings[orderHash]
        );
    }
}
