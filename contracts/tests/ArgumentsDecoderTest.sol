// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "../libraries/ArgumentsDecoder.sol";
import "hardhat/console.sol";

contract ArgumentsDecoderTest {
    using ArgumentsDecoder for bytes;

    function fBool() external pure returns(bool) {
        return true;
    }

    function fUint() external pure returns(uint256) {
        return 123;
    }

    function testDecodeBool() external view {
        (bool success, bytes memory result) = address(this).staticcall(abi.encodePacked(this.fBool.selector));
        require(success, "fBool call failed");
        uint256 gasCustom = gasleft();
        result.decodeBool();
        gasCustom = gasCustom - gasleft();
        uint256 gasNative = gasleft();
        abi.decode(result, (bool));
        gasNative = gasNative - gasleft();
        console.log(gasCustom, gasNative);
    }

    function testDecodeUint() external view {
        (bool success, bytes memory result) = address(this).staticcall(abi.encodePacked(this.fUint.selector));
        require(success, "fUint call failed");
        uint256 gasCustom = gasleft();
        result.decodeUint256();
        gasCustom = gasCustom - gasleft();
        uint256 gasNative = gasleft();
        abi.decode(result, (uint256));
        gasNative = gasNative - gasleft();
        console.log(gasCustom, gasNative);
    }
}
