// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { TakerTraits } from "../libraries/TakerTraitsLib.sol";

contract TakerContract {
    IOrderMixin private immutable _SWAP;

    constructor(IOrderMixin swap) {
        _SWAP = swap;
    }

    function fillOrder(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits
    ) external payable {
        _SWAP.fillOrder {value: msg.value} (order, r, vs, amount, takerTraits);
    }
}
