// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { Errors } from "../libraries/Errors.sol";
import { EIP712Alien } from "../utils/EIP712Alien.sol";
import { OrderLib } from "../OrderLib.sol";
import { NativeOrderImpl } from "./NativeOrderImpl.sol";

abstract contract NativeOrderFactoryBase is Ownable, EIP712Alien {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;

    event NativeOrderCreated(address maker, bytes32 orderHash, address clone, uint256 value);

    error OrderReceiverShouldBeSetCorrectly(address receiver);
    error OrderMakerShouldBeMsgSender(address expected, address actual);
    error OrderMakingAmountShouldBeEqualToMsgValue(uint256 expected, uint256 actual);

    address public immutable IMPLEMENTATION;

    function create(IOrderMixin.Order calldata makerOrder) external payable returns (address clone) {
        // Validate main order parameters
        if (makerOrder.maker.get() != msg.sender) revert OrderMakerShouldBeMsgSender(msg.sender, makerOrder.maker.get());
        address receiver = makerOrder.receiver.get();
        if (receiver == address(0) || receiver == address(this)) revert OrderReceiverShouldBeSetCorrectly(receiver);
        if (msg.value != makerOrder.makingAmount) revert OrderMakingAmountShouldBeEqualToMsgValue(makerOrder.makingAmount, msg.value);

        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        clone = _deployNativeOrder(IMPLEMENTATION, makerOrderHash);
        NativeOrderImpl(payable(clone)).depositAndApprove{ value: msg.value }();

        IOrderMixin.Order memory order = makerOrder;
        order.maker = Address.wrap(uint160(clone));
        bytes32 orderHash = order.hashMemory(_domainSeparatorV4());
        emit NativeOrderCreated(msg.sender, orderHash, clone, msg.value);
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(to).call{ value: amount }("");
            if (!success) revert Errors.ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _deployNativeOrder(address implementation, bytes32 salt) internal virtual returns (address) {
        return implementation.cloneDeterministic(salt);
    }
}
