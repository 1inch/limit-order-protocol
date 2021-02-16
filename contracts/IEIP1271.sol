pragma solidity ^0.5.0;

library EIP1271Constants {
    // bytes4(keccak256("isValidSignature(bytes,bytes)")
    bytes4 constant internal EIP1271_MAGIC_VALUE = 0x20c13b0b;
}

contract IEIP1271 is EIP1271Constants {
    function isValidSignature(
        bytes calldata _data,
        bytes calldata _signature
    )
        external
        view
        virtual
        returns (bytes4);
}
