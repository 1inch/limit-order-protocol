// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPermit2TransferFrom.sol";
import "./ImmutableOwner.sol";

/* solhint-disable func-name-mixedcase */

contract Permit2Proxy is ImmutableOwner {

    /// @notice 0x000000000022D473030F116dDEE9F6B43aC78BA3 for evm chain
    /// @notice https://docs.uniswap.org/contracts/v3/reference/deployments/Ethereum-deployments
    /// @notice 0x0000000000225e31d15943971f47ad3022f714fa for zksync
    /// @notice https://docs.uniswap.org/contracts/v3/reference/deployments/ZKsync-deployments
    /// @notice The Permit2 contract address

    IPermit2TransferFrom private immutable _PERMIT2;

    error Permit2ProxyBadSelector();

    constructor(address _immutableOwner, address _permit2) ImmutableOwner(_immutableOwner) {
        if (Permit2Proxy.func_nZHTch.selector != IERC20.transferFrom.selector) revert Permit2ProxyBadSelector();
        _PERMIT2 = IPermit2TransferFrom(_permit2);
    }

    /// @notice Proxy transfer method for `Permit2.permitTransferFrom`. Selector must match `IERC20.transferFrom`
    // keccak256("func_nZHTch(address,address,uint256,((address,uint256),uint256,uint256),bytes)") == 0x23b872dd (IERC20.transferFrom)
    function func_nZHTch(
        address from,
        address to,
        uint256 amount,
        IPermit2TransferFrom.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external onlyImmutableOwner {
        _PERMIT2.permitTransferFrom(
            permit,
            IPermit2TransferFrom.SignatureTransferDetails({
                to: to,
                requestedAmount: amount
            }),
            from,
            sig
        );
    }
}

/* solhint-enable func-name-mixedcase */
