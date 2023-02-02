// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IInteractionNotificationReceiver.sol";
import "../interfaces/IOrderMixin.sol";
import "../interfaces/IOrderRFQMixin.sol";

contract RecursiveMatcher is IInteractionNotificationReceiver {
    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    bytes1 private constant _RFQ_FLAG = 0x02; // set this flag, if RFQ order is filling

    error IncorrectCalldataParams();
    error FailedExternalCall();

    function matchOrders(
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

    function matchRfqOrders(
        IOrderRFQMixin orderRFQMixin,
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount
    ) external {
        orderRFQMixin.fillOrderRFQ(
            order,
            signature,
            interaction,
            flagsAndAmount
        );
    }

    function fillOrderInteraction(
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        bytes calldata interactiveData
    ) external returns(uint256) {
        if(interactiveData[0] & _FINALIZE_INTERACTION != 0x0) {
            (
                address[] memory targets,
                bytes[] memory calldatas
            ) = abi.decode(interactiveData[1:], (address[], bytes[]));

            if(targets.length != calldatas.length) revert IncorrectCalldataParams();
            for(uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if(!success) revert FailedExternalCall();
            }
        } else {
            if(interactiveData[0] & _RFQ_FLAG != 0x0) {
                (
                    OrderRFQLib.OrderRFQ memory order,
                    bytes memory signature,
                    bytes memory interaction,
                    uint256 flagsAndAmount
                ) = abi.decode(interactiveData[1:], (OrderRFQLib.OrderRFQ, bytes, bytes, uint256));

                IOrderRFQMixin(msg.sender).fillOrderRFQ(
                    order,
                    signature,
                    interaction,
                    flagsAndAmount
                );
            } else {
                (
                    OrderLib.Order memory order,
                    bytes memory signature,
                    bytes memory interaction,
                    uint256 makingOrderAmount,
                    uint256 takingOrderAmount,
                    uint256 thresholdAmount
                ) = abi.decode(interactiveData[1:], (OrderLib.Order, bytes, bytes, uint256, uint256, uint256));

                IOrderMixin(msg.sender).fillOrder(
                    order,
                    signature,
                    interaction,
                    makingOrderAmount,
                    takingOrderAmount,
                    thresholdAmount
                );
            }
        }
        return 0;
    }
}
