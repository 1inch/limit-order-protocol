// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;
pragma abicoder v1;

import "../libraries/ArgumentsDecoder.sol";
import "../interfaces/InteractiveNotificationReceiver.sol";
import "./interfaces/IWithdrawable.sol";

contract InteractiveNotificationReceiverMock is InteractiveNotificationReceiver {
    using ArgumentsDecoder for bytes;

    event Received(address, uint);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // unwrap takerAsset for tests
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
