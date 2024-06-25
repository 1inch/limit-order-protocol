// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "./IOrderMixin.sol";

interface IOrderRegistrator {
    event OrderRegistered(IOrderMixin.Order order, bytes extension, bytes signature);

    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension, bytes calldata signature) external;
}
