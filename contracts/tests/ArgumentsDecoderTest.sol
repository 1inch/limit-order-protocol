// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "../libraries/ArgumentsDecoder.sol";

contract ArgumentsDecoderTest {
    using ArgumentsDecoder for bytes;

    error fBoolCallFailed();
    error fUintCallFailed();

    function fBool() external pure returns(bool) {
        return true;
    }

    function fUint() external pure returns(uint256) {
        return 123;
    }

    function testDecodeBool() external view {
        (bool success, bytes memory result) = address(this).staticcall(abi.encodePacked(this.fBool.selector));
        if (!success) revert fBoolCallFailed();
        uint256 gasCustom = gasleft();
        result.decodeBoolMemory();
        gasCustom = gasCustom - gasleft();
        uint256 gasNative = gasleft();
        abi.decode(result, (bool));
        gasNative = gasNative - gasleft();
    }

    function testDecodeUint() external view {
        (bool success, bytes memory result) = address(this).staticcall(abi.encodePacked(this.fUint.selector));
        if (!success) revert fUintCallFailed();
        uint256 gasCustom = gasleft();
        result.decodeUint256Memory();
        gasCustom = gasCustom - gasleft();
        uint256 gasNative = gasleft();
        abi.decode(result, (uint256));
        gasNative = gasNative - gasleft();
    }
}
