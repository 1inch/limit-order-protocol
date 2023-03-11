// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ITakerInteraction.sol";
import "../interfaces/IOrderMixin.sol";

contract TakerIncreaser is ITakerInteraction {
    error IncorrectCalldataParams();
    error FailedExternalCall();

    function fillOrderTo(
        IOrderMixin orderMixin,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction
    ) external {
        orderMixin.fillOrderTo(
            order,
            r,
            vs,
            amount,
            takerTraits,
            target,
            interaction
        );
    }

    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
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
