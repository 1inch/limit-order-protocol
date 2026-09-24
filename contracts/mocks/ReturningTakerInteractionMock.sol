// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "../interfaces/IOrderMixin.sol";

/**
 * @title Taker interaction that returns data despite the void interface
 * @notice Test-only. Exists to show that the protocol ignores anything a taker
 * interaction returns (GAP-016, requirement INT-002).
 *
 * `description.md` documents `takerInteraction` as returning an
 * `offeredTakingAmount` that improves the maker's rate unless a
 * `NO_IMPROVE_RATE` flag is set. Neither the return value nor the flag exists
 * in the code: `ITakerInteraction.takerInteraction` is declared `external`
 * with no return, and `OrderMixin` discards any return data. Gate A decided
 * that documentation passage a DOCUMENTATION_BUG (DIV-001).
 *
 * A function selector is derived from the name and parameter types only, not
 * the return type, so this contract answers on exactly the selector the
 * protocol calls while returning 32 bytes the protocol cannot see.
 */
contract ReturningTakerInteractionMock {
    uint256 private _returnValue;

    function setReturnValue(uint256 value) external {
        _returnValue = value;
    }

    /// @notice Same selector as `ITakerInteraction.takerInteraction`, with a return value bolted on.
    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external view returns (uint256) {
        return _returnValue;
    }
}
