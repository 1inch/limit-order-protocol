// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IPermit2TransferFrom.sol";
import "./ImmutableOwner.sol";

/* solhint-disable func-name-mixedcase */

/// @title Permit2Proxy
/// @notice A proxy contract that enables using Uniswap's Permit2 `permitTransferFrom` within the limit order protocol.
/// @dev Permit2 nonces are single-use

contract Permit2Proxy is ImmutableOwner {

    /// @notice The Permit2 contract address.
    /// @dev Use `0x000000000022D473030F116dDEE9F6B43aC78BA3` for EVM chains
    /// or `0x0000000000225e31d15943971f47ad3022f714fa` for zkSync Era.
    /// See https://docs.uniswap.org/contracts/v3/reference/deployments
    IPermit2TransferFrom private immutable _PERMIT2;

    /// @notice Thrown when `func_nZHTch` selector does not match `IERC20.transferFrom` selector.
    error Permit2ProxyBadSelector();

    /// @notice Initializes the proxy with the immutable owner and the Permit2 contract address.
    /// @param _immutableOwner The address of the limit order protocol contract.
    /// @param _permit2 The Permit2 contract address for the target chain.
    constructor(address _immutableOwner, address _permit2) ImmutableOwner(_immutableOwner) {
        if (Permit2Proxy.func_nZHTch.selector != IERC20.transferFrom.selector) revert Permit2ProxyBadSelector();
        _PERMIT2 = IPermit2TransferFrom(_permit2);
    }

    /// @notice Proxy transfer method for `Permit2.permitTransferFrom`. Selector must match `IERC20.transferFrom`.
    /// @dev The function name `func_nZHTch` is chosen so that its selector equals `0x23b872dd`
    /// (same as `IERC20.transferFrom`), allowing it to be used as a maker asset in limit orders.
    /// keccak256("func_nZHTch(address,address,uint256,((address,uint256),uint256,uint256),bytes)") == 0x23b872dd
    /// @param from The token owner whose tokens are being transferred.
    /// @param to The recipient of the tokens.
    /// @param amount The amount of tokens to transfer.
    /// @param permit The Permit2 permit data containing token permissions, nonce, and deadline.
    /// @param sig The signature authorizing the transfer, signed by `from`.
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
