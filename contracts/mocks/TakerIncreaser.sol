// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IInteractionNotificationReceiver.sol";
import "../interfaces/IOrderMixin.sol";

contract TakerIncreaser is IInteractionNotificationReceiver {
    error IncorrectCalldataParams();
    error FailedExternalCall();

    function fillOrder(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external {
        orderMixin.fillOrder(
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
    }

    function fillOrderInteraction(
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external returns(uint256) {
        (
            address[] memory targets,
            bytes[] memory calldatas
        ) = abi.decode(interactiveData, (address[], bytes[]));

        if(targets.length != calldatas.length) revert IncorrectCalldataParams();
        for(uint256 i = 0; i < targets.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = targets[i].call(calldatas[i]);
            if(!success) revert FailedExternalCall();
        }

        return takingAmount * 15 / 10; // increase 50% taking amount
    }
}