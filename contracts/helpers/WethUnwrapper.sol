// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "../interfaces/IPostInteraction.sol";
import "../libraries/Errors.sol";

contract WethUnwrapper is OnlyWethReceiver, IPostInteraction {
    using SafeERC20 for IWETH;
    using AddressLib for Address;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        address receiver = order.maker.get();
        if (extraData.length == 20) {
            receiver = address(bytes20(extraData));
        }
        _WETH.safeWithdrawTo(takingAmount, receiver);
    }
}
