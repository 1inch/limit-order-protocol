// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";

import "../interfaces/IPostInteractionNotificationReceiver.sol";
import "../libraries/Errors.sol";

contract WethUnwrapper is OnlyWethReceiver, IPostInteractionNotificationReceiver {
    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;

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
        bytes calldata interactiveData
    ) external override {
        _WETH.withdraw(takingAmount);
        address receiver = maker;
        if (interactiveData.length == 20) {
            receiver = address(bytes20(interactiveData));
        }
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = receiver.call{value: takingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
        if (!success) revert Errors.ETHTransferFailed();
    }
}
