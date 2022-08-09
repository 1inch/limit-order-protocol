// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";

import "../interfaces/NotificationReceiver.sol";

contract WethUnwrapper is OnlyWethReceiver, PostInteractionNotificationReceiver {
    error ETHTransferFailed();

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    function fillOrderPostInteraction(
        bytes32 /* orderHash */,
        address maker,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakerAmount */,
        bytes calldata /* interactiveData */
    ) external override {
        _WETH.withdraw(takingAmount);
        (bool success, ) = maker.call{value: takingAmount}("");  // solhint-disable-line avoid-low-level-calls
        if (!success) revert ETHTransferFailed();
    }
}
