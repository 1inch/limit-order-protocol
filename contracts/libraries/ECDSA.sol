// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

library ECDSA {
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

            // memory[ptr:ptr+0x80] = (hash, v, r, s)
            switch signature.length
            case 65 {
                mstore(0x40, add(ptr, 0x80))

                // memory[ptr+0x20:ptr+0x80] = (v, r, s)
                mstore(add(ptr, 0x20), byte(0, calldataload(add(signature.offset, 0x40))))
                calldatacopy(add(ptr, 0x40), signature.offset, 0x40)
            }
            case 64 {
                mstore(0x40, add(ptr, 0x80))

                // memory[ptr+0x20:ptr+0x80] = (v, r, s)
                let vs := calldataload(add(signature.offset, 0x20))
                mstore(add(ptr, 0x20), add(27, shr(255, vs)))
                calldatacopy(add(ptr, 0x40), signature.offset, 0x20)
                mstore(add(ptr, 0x60), shr(1, shl(1, vs)))
            }
            default {
                ptr := 0
            }

            if ptr {
                if gt(mload(add(ptr, 0x60)), 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
                    ptr := 0
                }

                if ptr {
                    // memory[ptr:ptr+0x20] = (hash)
                    mstore(ptr, hash)

                    if staticcall(gas(), 0x1, ptr, 0x80, 0, 0x20) {
                        signer := mload(0)
                    }
                }
            }
        }
    }

    function recoverOrIsValidSignature(address signer, bytes32 hash, bytes calldata signature) internal view returns(bool success) {
        if ((signature.length == 64 || signature.length == 65) && recover(hash, signature) == signer) {
            return true;
        }
        return isValidSignature(signer, hash, signature);
    }

    function recoverOrIsValidSignature(address signer, bytes32 hash, bytes32 r, bytes32 vs) internal view returns(bool success) {
        if (recover(hash, r, vs) == signer) {
            return true;
        }
        return isValidSignature(signer, hash, r, vs);
    }

    function recoverOrIsValidSignature65(address signer, bytes32 hash, bytes32 r, bytes32 vs) internal view returns(bool success) {
        if (recover(hash, r, vs) == signer) {
            return true;
        }
        return isValidSignature65(signer, hash, r, vs);
    }

    function isValidSignature(address signer, bytes32 hash, bytes calldata signature) internal view returns(bool success) {
        // (bool success, bytes memory data) = signer.staticcall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, hash, signature));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
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

    function isValidSignature(address signer, bytes32 hash, bytes32 r, bytes32 vs) internal view returns(bool success) {
        // (bool success, bytes memory data) = signer.staticcall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, hash, abi.encodePacked(r, vs)));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0x64, 64)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mstore(add(ptr, 0x44), 64)
            mstore(add(ptr, 0x64), r)
            mstore(add(ptr, 0x84), vs)
            mstore(0, 0)
            if staticcall(gas(), signer, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }

    function isValidSignature65(address signer, bytes32 hash, bytes32 r, bytes32 vs) internal view returns(bool success) {
        // (bool success, bytes memory data) = signer.staticcall(abi.encodeWithSelector(IERC1271.isValidSignature.selector, hash, abi.encodePacked(r, vs & ~uint256(1 << 255), uint8(vs >> 255))));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0x64, 65)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mstore(add(ptr, 0x44), 65)
            mstore(add(ptr, 0x64), r)
            mstore(add(ptr, 0x84), shr(1, shl(1, vs)))
            mstore8(add(ptr, 0xa4), add(27, shr(255, vs)))
            mstore(0, 0)
            if staticcall(gas(), signer, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }

    // EIP1271 Mutable Extension:

    function recoverOrIsValidSignatureAndApprove(address signer, bytes32 hash, bytes calldata signature, address token, uint256 amount) internal returns(bool success) {
        if ((signature.length == 64 || signature.length == 65) && recover(hash, signature) == signer) {
            return true;
        }
        return isValidSignatureAndApprove(signer, hash, signature, token, amount);
    }

    function recoverOrIsValidSignatureAndApprove(address signer, bytes32 hash, bytes32 r, bytes32 vs, address token, uint256 amount) internal returns(bool success) {
        if (recover(hash, r, vs) == signer) {
            return true;
        }
        return isValidSignatureAndApprove(signer, hash, r, vs, token, amount);
    }

    function recoverOrIsValidSignatureAndApprove65(address signer, bytes32 hash, bytes32 r, bytes32 vs, address token, uint256 amount) internal returns(bool success) {
        if (recover(hash, r, vs) == signer) {
            return true;
        }
        return isValidSignatureAndApprove65(signer, hash, r, vs, token, amount);
    }

    function isValidSignatureAndApprove(address signer, bytes32 hash, bytes calldata signature, address token, uint256 amount) internal returns(bool success) {
        // (bool success, bytes memory data) = signer.call(abi.encodePacked(IERC1271.isValidSignature.selector, abi.encode(hash, signature, token, amount)));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0xa4, signature.length)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x80)
            mstore(add(ptr, 0x44), token)
            mstore(add(ptr, 0x64), amount)
            mstore(add(ptr, 0x84), signature.length)
            calldatacopy(add(ptr, 0xa4), signature.offset, signature.length)
            mstore(0, 0)
            if call(gas(), signer, 0, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }

    function isValidSignatureAndApprove(address signer, bytes32 hash, bytes32 r, bytes32 vs, address token, uint256 amount) internal returns(bool success) {
        // (bool success, bytes memory data) = signer.call(abi.encodePacked(IERC1271.isValidSignature.selector, abi.encode(hash, abi.encodePacked(r, vs), token, amount)));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0x84, 64)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x80)
            mstore(add(ptr, 0x44), token)
            mstore(add(ptr, 0x64), amount)
            mstore(add(ptr, 0x84), 64)
            mstore(add(ptr, 0xa4), r)
            mstore(add(ptr, 0xc4), vs)
            mstore(0, 0)
            if call(gas(), signer, 0, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }

    function isValidSignatureAndApprove65(address signer, bytes32 hash, bytes32 r, bytes32 vs, address token, uint256 amount) internal returns(bool success) {
        // (bool success, bytes memory data) = signer.call(abi.encodePacked(IERC1271.isValidSignature.selector, abi.encode(hash, abi.encodePacked(r, vs & ~uint256(1 << 255), uint8(vs >> 255)), token, amount)));
        // return success && data.length >= 4 && abi.decode(data, (bytes4)) == IERC1271.isValidSignature.selector;
        bytes4 selector = IERC1271.isValidSignature.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            let len := add(0xa4, 65)
            mstore(0x40, add(ptr, len))

            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x80)
            mstore(add(ptr, 0x44), token)
            mstore(add(ptr, 0x64), amount)
            mstore(add(ptr, 0x84), 65)
            mstore(add(ptr, 0xa4), r)
            mstore(add(ptr, 0xc4), shr(1, shl(1, vs)))
            mstore8(add(ptr, 0xe4), add(27, shr(255, vs)))
            mstore(0, 0)
            if call(gas(), signer, 0, ptr, len, 0, 0x20) {
                success := eq(selector, mload(0))
            }
        }
    }
}
