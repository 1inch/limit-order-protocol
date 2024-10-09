// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";

/**
 * @title PostInteraction Controller Contract
 * @notice Base contract that facilitates inheritance for two other contracts, allowing control to be transferred between them via `super`.
 * It enables contracts such as `FeeTaker` to delegate control to the next extension in the contract chain, but can be adapted for any extension as needed.
 */
abstract contract PostInteractionController {
    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual {} // solhint-disable-line no-empty-blocks
}
