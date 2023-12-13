// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { TakerTraits } from "../libraries/TakerTraitsLib.sol";

contract TakerContract {
    IOrderMixin private immutable _swap;

    constructor(IOrderMixin swap) {
        _swap = swap;
    }

    function fillOrder(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits
    ) external payable {
        _swap.fillOrder {value: msg.value} (order, r, vs, amount, takerTraits);
    }
}
