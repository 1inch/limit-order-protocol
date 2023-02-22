// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ITakerInteraction.sol";
import "../interfaces/IOrderMixin.sol";

contract TakerIncreaser is ITakerInteraction {
    error IncorrectCalldataParams();
    error FailedExternalCall();

    function fillOrderExt(
        IOrderMixin orderMixin,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        bytes calldata interaction,
        bytes calldata extension
    ) external {
        orderMixin.fillOrderToExt(
            order,
            r,
            vs,
            amount,
            limits,
            address(this),
            interaction,
            extension
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

        if (targets.length != calldatas.length) revert IncorrectCalldataParams();
        for(uint256 i = 0; i < targets.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = targets[i].call(calldatas[i]);
            if(!success) revert FailedExternalCall();
        }

        return takingAmount * 15 / 10; // increase 50% taking amount
    }
}
