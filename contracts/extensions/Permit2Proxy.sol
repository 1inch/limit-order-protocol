// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPermit2TransferFrom.sol";
import "./ImmutableOwner.sol";

/* solhint-disable func-name-mixedcase */

contract Permit2Proxy is ImmutableOwner {
    error Permit2ProxyBadSelector();

    IPermit2WitnessTransferFrom private constant _PERMIT2 = IPermit2WitnessTransferFrom(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        if (Permit2Proxy.func_chVsN.selector != IERC20.transferFrom.selector) revert Permit2ProxyBadSelector();
    }

    /// @notice Proxy transfer method for `Permit2.permitTransferFrom`. Selector must match `IERC20.transferFrom`
    // keccak256("func_chVsN(address,address,uint256,address,uint256,uint256,uint256,bytes)") == 0x23b872dd (IERC20.transferFrom)
    function func_chVsN(
        address from,
        address to,
        uint256 amount,
        IPermit2WitnessTransferFrom.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external onlyImmutableOwner {
        _PERMIT2.permitTransferFrom(
            permit,
            IPermit2WitnessTransferFrom.SignatureTransferDetails({
                to: to,
                requestedAmount: amount
            }),
            from,
            sig
        );
    }
}

/* solhint-enable func-name-mixedcase */
