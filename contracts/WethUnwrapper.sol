// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "./interfaces/InteractiveNotificationReceiver.sol";
import "./interfaces/IWithdrawable.sol";

contract WethUnwrapper is InteractiveNotificationReceiver {
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function notifyFillOrder(
        address /* taker */,
        address /* makerAsset */,
        address takerAsset,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external override {
        address payable makerAddress;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            makerAddress := shr(96, calldataload(interactiveData.offset))
        }
        IWithdrawable(takerAsset).withdraw(takingAmount);
        makerAddress.transfer(takingAmount);
    }
}
