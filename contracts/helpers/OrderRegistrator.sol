// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { ECDSA } from "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";
import { OrderLib } from "../OrderLib.sol";

/**
 * @title OrderRegistrator
 */
contract OrderRegistrator is IOrderRegistrator {
    using AddressLib for Address;
    using OrderLib for IOrderMixin.Order;

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;

    constructor(IOrderMixin limitOrderProtocol) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
    }

    /**
     * @notice See {IOrderRegistrator-registerOrder}.
     */
    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension, bytes calldata signature) external {
        // Validate order
        {
            (bool valid, bytes4 validationResult) = order.isValidExtension(extension);
            if (!valid) {
                // solhint-disable-next-line no-inline-assembly
                assembly ("memory-safe") {
                    mstore(0, validationResult)
                    revert(0, 4)
                }
            }
        }

        // Validate signature
        if(!ECDSA.recoverOrIsValidSignature(order.maker.get(), _LIMIT_ORDER_PROTOCOL.hashOrder(order), signature)) revert IOrderMixin.BadSignature();

        emit OrderRegistered(order, extension, signature);
    }
}
