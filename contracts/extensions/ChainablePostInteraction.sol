// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IPostInteraction } from "../interfaces/IPostInteraction.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";

abstract contract ChainablePostInteraction is IPostInteraction {
    error ChainablePostInteractionAccessDenied(address caller);

    address internal immutable _LOP;

    modifier onlyLimitOrderProtocolOrTail(uint80 allowedTail) {
        if ((msg.sender != _LOP) && (uint80(uint160(msg.sender)) != allowedTail)) revert ChainablePostInteractionAccessDenied(msg.sender);
        _;
    }

    constructor(address lop) {
        _LOP = lop;
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external onlyLimitOrderProtocolOrTail(uint80(bytes10(extraData[20:]))) {
        bytes calldata tail = _postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
        if (tail.length > 19) {
            IPostInteraction(address(bytes20(tail))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, tail[20:]);
        }
    }

    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual returns (bytes calldata);
}
