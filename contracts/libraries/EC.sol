// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

library EC {
    function recover(bytes32 hash, bytes32 r, bytes32 vs) internal view returns(address signer) {
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x80))

            mstore(ptr, hash)
            mstore(add(ptr, 0x20), add(27, shr(255, vs)))
            mstore(add(ptr, 0x40), r)
            mstore(add(ptr, 0x60), shr(1, shl(1, vs)))
            if staticcall(gas(), 0x1, ptr, 0x80, 0, 0x20) {
                signer := mload(0)
            }
        }
    }

    function recover(bytes32 hash, bytes calldata signature) internal view returns(address signer) {
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x80))

            mstore(ptr, hash)
            mstore(add(ptr, 0x20), byte(0, calldataload(add(signature.offset, 0x40))))
            calldatacopy(add(ptr, 0x40), signature.offset, 0x40)
            if staticcall(gas(), 0x1, ptr, 0x80, 0, 0x20) {
                signer := mload(0)
            }
        }
    }

    function isValidSignatureNow(address signer, bytes32 hash, bytes calldata signature) internal view returns(bool success) {
        if (signature.length == 65 && recover(hash, signature) == signer) {
            return true;
        }

        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0x64, signature.length)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mstore(add(ptr, 0x44), signature.length)
            calldatacopy(add(ptr, 0x64), signature.offset, signature.length)
            mstore(0, 0)
            if staticcall(gas(), signer, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }
}
