// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/NotificationReceiver.sol";
import "../interfaces/IOrderMixin.sol";

contract RecursiveMatcher is InteractionNotificationReceiver {
    bytes1 private constant _FINALIZATION_INTERACTION = 0x01;

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

    function fillOrderInteraction(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external override {
        if(interactiveData[0] == _FINALIZATION_INTERACTION) {
            (
                address[] memory targets,
                bytes[] memory calldatas
            ) = abi.decode(interactiveData[1:], (address[], bytes[]));

            require(targets.length == calldatas.length, "");
            for(uint256 i = 0; i < targets.length; i++) {
                targets[i].call(calldatas[i]);
            }
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
}