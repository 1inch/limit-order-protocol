// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

contract WethUnwrapper is OnlyWethReceiver {
    using SafeERC20 for IWETH;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    // Limit Order Protocol V3 support
    function fillOrderPostInteraction(
        bytes32 /* orderHash */,
        address maker,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakerAmount */,
        bytes calldata interactiveData
    ) external {
        address receiver = maker;
        if (interactiveData.length == 20) {
            receiver = address(bytes20(interactiveData));
        }
        _WETH.safeWithdrawTo(takingAmount, receiver);
    }
}
