// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IInteractionNotificationReceiver.sol";
import "../interfaces/IOrderMixin.sol";
import "../interfaces/IOrderRFQMixin.sol";
import "../libraries/InputLib.sol";

contract RecursiveMatcher is IInteractionNotificationReceiver {
    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    bytes1 private constant _RFQ_FLAG = 0x02; // set this flag, if RFQ order is filling

    error IncorrectCalldataParams();
    error FailedExternalCall(bytes reason);

    function matchOrders(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 thresholdAmount
    ) external {
        orderMixin.fillOrder(
            order,
            signature,
            interaction,
            input,
            thresholdAmount
        );
    }

    function matchRfqOrders(
        IOrderRFQMixin orderRFQMixin,
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        Input input,
        bytes calldata interaction
    ) external {
        orderRFQMixin.fillOrderRFQTo(
            order,
            r,
            vs,
            input,
            address(this),
            interaction
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
                (bool success, bytes memory reason) = targets[i].call(calldatas[i]);
                if(!success) revert FailedExternalCall(reason);
            }
        } else {
            if(interactiveData[0] & _RFQ_FLAG != 0x0) {
                // Not necessary to encode and decode calldata, because it is already encoded
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory reason) = msg.sender.call(
                    abi.encodePacked(IOrderRFQMixin.fillOrderRFQTo.selector, interactiveData[1:])
                );
                if (!success) revert FailedExternalCall(reason);

                // (
                //     OrderRFQLib.OrderRFQ memory order,
                //     bytes32 r,
                //     bytes32 vs,
                //     uint256 input,
                //     address target,
                //     bytes memory interaction
                // ) = abi.decode(interactiveData[1:], (OrderRFQLib.OrderRFQ, bytes32, bytes32, uint256, address, bytes));

                // IOrderRFQMixin(msg.sender).fillOrderRFQTo(
                //     order,
                //     r,
                //     vs,
                //     input,
                //     target,
                //     interaction
                // );
            } else {
                // Not necessary to encode and decode calldata, because it is already encoded
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory reason) = msg.sender.call(
                    abi.encodePacked(IOrderMixin.fillOrder.selector, interactiveData[1:])
                );
                if (!success) revert FailedExternalCall(reason);

                // (
                //     OrderLib.Order memory order,
                //     bytes memory signature,
                //     bytes memory interaction,
                //     uint256 makingOrderAmount,
                //     uint256 takingOrderAmount,
                //     uint256 thresholdAmount
                // ) = abi.decode(interactiveData[1:], (OrderLib.Order, bytes, bytes, uint256, uint256, uint256));

                // IOrderMixin(msg.sender).fillOrder(
                //     order,
                //     signature,
                //     interaction,
                //     makingOrderAmount,
                //     takingOrderAmount,
                //     thresholdAmount
                // );
            }
        }
        return 0;
    }
}
