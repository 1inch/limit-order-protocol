
Copy of OpenZeppelin ECDSA library that does not revert
https://github.com/OpenZeppelin/openzeppelin-contracts/blob/df7996b671d309ee949113c64beee9899133dc05/contracts/utils/cryptography/ECDSA.sol

Elliptic Curve Digital Signature Algorithm (ECDSA) operations.

These functions can be used to verify that a message was signed by the holder
of the private keys of a given address.

## Functions
### recover
```solidity
  function recover(
  ) internal returns (address)
```

Returns the address that signed a hashed message (`hash`) with
`signature`. This address can then be used for verification purposes.

The `ecrecover` EVM opcode allows for malleable (non-unique) signatures:
this function rejects them by requiring the `s` value to be in the lower
half order, and the `v` value to be either 27 or 28.

IMPORTANT: `hash` _must_ be the result of a hash operation for the
verification to be secure: it is possible to craft signatures that
recover to arbitrary addresses for non-hashed data. A safe way to ensure
this is by receiving a hash of the original message (which may otherwise
be too long), and then calling {toEthSignedMessageHash} on it.


### recover
```solidity
  function recover(
  ) internal returns (address)
```

Overload of {ECDSA-recover} that receives the `v`,
`r` and `s` signature fields separately.


### toEthSignedMessageHash
```solidity
  function toEthSignedMessageHash(
  ) internal returns (bytes32)
```

Returns an Ethereum Signed Message, created from a `hash`. This
produces hash corresponding to the one signed with the
https://eth.wiki/json-rpc/API#eth_sign[`eth_sign`]
JSON-RPC method as part of EIP-191.

See {recover}.
/


### toTypedDataHash
```solidity
  function toTypedDataHash(
  ) internal returns (bytes32)
```

Returns an Ethereum Signed Typed Data, created from a
`domainSeparator` and a `structHash`. This produces hash corresponding
to the one signed with the
https://eips.ethereum.org/EIPS/eip-712[`eth_signTypedData`]
JSON-RPC method as part of EIP-712.

See {recover}.
/


