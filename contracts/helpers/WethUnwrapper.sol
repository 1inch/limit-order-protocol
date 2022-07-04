// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "../interfaces/NotificationReceiver.sol";
import "../interfaces/IWithdrawable.sol";

contract WethUnwrapper is PostInteractionNotificationReceiver {
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function fillOrderPostInteraction(
        address /* taker */,
        address /* makerAsset */,
        address takerAsset,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external override {
        address payable makerAddress;
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            makerAddress := shr(96, calldataload(interactiveData.offset))
        }
        IWithdrawable(takerAsset).withdraw(takingAmount);
        makerAddress.transfer(takingAmount);
    }
}
