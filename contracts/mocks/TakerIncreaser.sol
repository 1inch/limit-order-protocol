// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ITakerInteraction.sol";
import "../interfaces/IOrderMixin.sol";

contract TakerIncreaser is ITakerInteraction {
    error IncorrectCalldataParams();
    error FailedExternalCall();

    function fillOrderArgs(
        IOrderMixin orderMixin,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external {
        orderMixin.fillOrderArgs(
            order,
            r,
            vs,
            amount,
            takerTraits,
            args
        );
    }

    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external returns(uint256) {
        if (extraData.length != 0) {
            (
                address[] memory targets,
                bytes[] memory calldatas
            ) = abi.decode(extraData, (address[], bytes[]));
            if (targets.length != calldatas.length) revert IncorrectCalldataParams();
            for (uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if(!success) revert FailedExternalCall();
            }
        }
        return takingAmount * 15 / 10; // increase 50% taking amount
    }
}
