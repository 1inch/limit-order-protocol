// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

library CalldataLib {
    type Address is uint256;

    uint256 private constant _USE_PERMIT2_FLAG = 1 << 255;
    uint256 private constant _LOW_160_BIT_MASK = (1 << 160) - 1;

    error IncorrectDataLength();

    function get(Address account) internal pure returns (address) {
        return address(uint160(Address.unwrap(account) & _LOW_160_BIT_MASK));
    }

    function usePermit2(Address account) internal pure returns (bool) {
        return Address.unwrap(account) & _USE_PERMIT2_FLAG != 0;
    }

    function decodeUint256(bytes calldata data, uint256 offset) internal pure returns(uint256 value) {
        unchecked { if (data.length < offset + 32) revert IncorrectDataLength(); }
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
        }
    }

    function decodeSelector(bytes calldata data) internal pure returns(bytes4 value) {
        if (data.length < 4) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeTailCalldata(bytes calldata data, uint256 tailOffset) internal pure returns(bytes calldata args) {
        if (data.length < tailOffset) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly {  // solhint-disable-line no-inline-assembly
            args.offset := add(data.offset, tailOffset)
            args.length := sub(data.length, tailOffset)
        }
    }

    function decodeTargetAndCalldata(bytes calldata data) internal pure returns(address target, bytes calldata args) {
        if (data.length < 20) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
            args.offset := add(data.offset, 20)
            args.length := sub(data.length, 20)
        }
    }
}
