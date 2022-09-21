// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../libraries/ArgumentsDecoder.sol";

contract ArgumentsDecoderTest {
    using ArgumentsDecoder for bytes;

    error InvalidResult();

    function testDecodeUint256(bytes calldata data, uint256 offset) external pure returns(uint256) {
        return data.decodeUint256(offset);
    }

    function testUint256CalldataOffsetGas(bytes calldata data, uint256 offset) external view returns(uint256 gasAbiDecode, uint256 gasLib) {
        uint256 g1;
        uint256 g2;
        uint256 g3;
        uint256 a;
        uint256 b;

        g1 = gasleft();
        a = abi.decode(data[offset:], (uint256));
        g2 = gasleft();
        b = data.decodeUint256(offset);
        g3 = gasleft();

        if (a != b) revert InvalidResult();
        return (g1 - g2, g2 - g3);
    }

    function testDecodeSelector(bytes calldata data) external pure returns(bytes4) {
        return data.decodeSelector();
    }

    function testSelectorGas(bytes calldata data) external view returns(uint256 gasAbiDecode, uint256 gasLib) {
        uint256 g1;
        uint256 g2;
        uint256 g3;
        bytes4 a;
        bytes4 b;

        g1 = gasleft();
        a = bytes4(data);
        g2 = gasleft();
        b = data.decodeSelector();
        g3 = gasleft();

        if (a != b) revert InvalidResult();
        return (g1 - g2, g2 - g3);
    }

    function testDecodeTailCalldata(bytes calldata data, uint256 tailOffset) external pure returns(bytes calldata) {
        return data.decodeTailCalldata(tailOffset);
    }

    function testDecodeTailCalldataGas(bytes calldata data, uint256 tailOffset) external view returns(uint256 gasAbiDecode, uint256 gasLib) {
        uint256 g1;
        uint256 g2;
        uint256 g3;
        bytes calldata a;
        bytes calldata b;

        g1 = gasleft();
        a = data[tailOffset:];
        g2 = gasleft();
        b = data.decodeTailCalldata(tailOffset);
        g3 = gasleft();

        if (keccak256(a) != keccak256(b)) revert InvalidResult();
        return (g1 - g2, g2 - g3);
    }

    function testDecodeTargetAndCalldata(bytes calldata data) external pure returns(address, bytes calldata) {
        return data.decodeTargetAndCalldata();
    }

    function testDecodeTargetAndCalldataGas(bytes calldata data) external view returns(uint256 gasAbiDecode, uint256 gasLib) {
        uint256 g1;
        uint256 g2;
        uint256 g3;
        address a1;
        bytes calldata a2;
        address b1;
        bytes calldata b2;

        g1 = gasleft();
        a1 = address(uint160(bytes20(abi.decode(data, (bytes32)))));
        a2 = data[20:];
        g2 = gasleft();
        (b1, b2) = data.decodeTargetAndCalldata();
        g3 = gasleft();

        if (a1 != b1 || keccak256(a2) != keccak256(b2)) revert InvalidResult();
        return (g1 - g2, g2 - g3);
    }
}
