// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @title IPermit2TransferFrom
/// @notice Interface for Uniswap's Permit2 SignatureTransfer `permitTransferFrom` functionality.
/// @custom:security-contact security@1inch.io
interface IPermit2TransferFrom {
    struct TokenPermissions {
        // ERC20 token address
        address token;
        // the maximum amount that can be spent
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        // a unique value for every token owner's signature to prevent signature replays
        uint256 nonce;
        // deadline on the permit signature
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        // recipient address
        address to;
        // spender requested amount
        uint256 requestedAmount;
    }

    /// @notice Transfers tokens using a signed permit.
    /// @param permit The permit data containing token permissions, nonce, and deadline.
    /// @param transferDetails The transfer recipient and requested amount.
    /// @param owner The token owner who signed the permit.
    /// @param signature The signature authorizing the transfer.
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}
