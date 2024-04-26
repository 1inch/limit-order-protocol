// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPermit2WitnessTransferFrom.sol";
import "./ImmutableOwner.sol";

/* solhint-disable func-name-mixedcase */

contract Permit2WitnessProxy is ImmutableOwner {
    error Permit2WitnessProxyBadSelector();

    struct Witness {
        bytes32 salt;
    }

    string private constant _WITNESS_TYPE_STRING =
		"Witness witness)TokenPermissions(address token,uint256 amount)Witness(bytes32 salt)";

    IPermit2WitnessTransferFrom private constant _PERMIT2 = IPermit2WitnessTransferFrom(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        if (Permit2WitnessProxy.func_801zDya.selector != IERC20.transferFrom.selector) revert Permit2WitnessProxyBadSelector();
    }

    /// @notice Proxy transfer method for `Permit2.permitWitnessTransferFrom`. Selector must match `IERC20.transferFrom`
    // keccak256("func_801zDya(address,address,uint256,address,uint256,uint256,uint256,bytes32,bytes)") == 0x23b872dd (IERC20.transferFrom)
    function func_801zDya(
        address from,
        address to,
        uint256 amount,
        IPermit2WitnessTransferFrom.PermitTransferFrom calldata permit,
        bytes32 witness,
        bytes calldata sig
    ) external onlyImmutableOwner {
        _PERMIT2.permitWitnessTransferFrom(
            permit,
            IPermit2WitnessTransferFrom.SignatureTransferDetails({
                to: to,
                requestedAmount: amount
            }),
            from,
            witness,
            _WITNESS_TYPE_STRING,
            sig
        );
    }
}

/* solhint-enable func-name-mixedcase */
