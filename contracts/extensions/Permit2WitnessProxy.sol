// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./ImmutableOwner.sol";

interface Permit2 {
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

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;
}

/* solhint-disable func-name-mixedcase */

contract Permit2WitnessProxy is ImmutableOwner {
    error Permit2WitnessProxyBadSelector();

    struct Witness {
        bytes32 salt;
    }

    string private constant _WITNESS_TYPE_STRING =
		"Witness witness)TokenPermissions(address token,uint256 amount)Witness(bytes32 salt)";

	bytes32 private constant _WITNESS_TYPEHASH = keccak256("Witness(bytes32 salt)");

    Permit2 private constant _PERMIT2 = Permit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        if (Permit2WitnessProxy.func_20glDB1.selector != IERC20.transferFrom.selector) revert Permit2WitnessProxyBadSelector();
    }

    /// @notice Proxy transfer method for `Permit2.permitWitnessTransferFrom`. Selector must match `IERC20.transferFrom`
    // keccak256("func_20glDB1(address,address,uint256,address,uint256,uint256,uint256,bytes32,bytes)") == 0x23b872dd (IERC20.transferFrom)
    function func_20glDB1(
        address from,
        address to,
        uint256 amount,
        address token,
        uint256 permittedAmount,
        uint256 nonce,
        uint256 deadline,
        bytes32 salt,
        bytes calldata sig
    ) external onlyImmutableOwner {
        _PERMIT2.permitWitnessTransferFrom(
            Permit2.PermitTransferFrom({
                permitted: Permit2.TokenPermissions({
                    token: token,
                    amount: permittedAmount
                }),
                nonce: nonce,
                deadline: deadline
            }),
            Permit2.SignatureTransferDetails({
                to: to,
                requestedAmount: amount
            }),
            from,
            keccak256(abi.encode(_WITNESS_TYPEHASH, Witness(salt))),
            _WITNESS_TYPE_STRING,
            sig
        );
    }
}

/* solhint-enable func-name-mixedcase */
