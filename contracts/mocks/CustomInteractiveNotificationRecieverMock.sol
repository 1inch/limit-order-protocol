// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/ArgumentsDecoder.sol";
import "../interfaces/CustomInteractiveNotificationReciever.sol";
import "../interfaces/WrappedTokenInterface.sol";

contract CustomInteractiveNotificationRecieverMock {
    using ArgumentsDecoder for bytes;

    event Received(address, uint);

    uint256 constant private _MAKER_ADDRESS_INDEX = 1;

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // wrap takerAsset for tests
    function notifyFillOrder(
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external {
        address payable makerAddress = payable(interactiveData.decodeAddress(_MAKER_ADDRESS_INDEX));
        WrappedTokenInterface(takerAsset).transferFrom(makerAddress, address(this), takingAmount);
        WrappedTokenInterface(takerAsset).withdraw(takingAmount);
        makerAddress.transfer(takingAmount);
    }
}
