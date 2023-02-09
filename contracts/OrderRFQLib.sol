// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./libraries/ConstraintsLib.sol";

library OrderRFQLib {
    struct OrderRFQ {
        uint256 salt;
        Address makerAsset;
        Address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        Constraints constraints;
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 salt,"
            "address makerAsset,"
            "address takerAsset,"
            "uint256 makingAmount,"
            "uint256 takingAmount,"
            "uint256 constraints"
        ")"
    );

    function hash(OrderRFQ calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_RFQ_TYPEHASH;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_RFQ_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, 0xc0)
            result := keccak256(ptr, 0xe0)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }
}
