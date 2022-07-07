// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "../interfaces/NotificationReceiver.sol";
import "../interfaces/IWETH.sol";

contract WethUnwrapper is PostInteractionNotificationReceiver {
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function fillOrderPostInteraction(
        bytes32 /* orderHash */,
        address /* taker */,
        address /* makerAsset */,
        address takerAsset,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakerAmount */,
        bytes calldata interactiveData
    ) external override {
        address payable makerAddress;
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            makerAddress := shr(96, calldataload(interactiveData.offset))
        }
        IWETH(takerAsset).withdraw(takingAmount);
        makerAddress.transfer(takingAmount);
    }
}
