// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "./libraries/CalldataLib.sol";

library OrderRFQLib {
    type Address is uint256;

    struct OrderRFQ {
        uint256 info;  // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
        CalldataLib.Address makerAsset;
        CalldataLib.Address takerAsset;
        CalldataLib.Address maker;
        CalldataLib.Address allowedSender;  // equals to Zero address on public orders
        uint256 makingAmount;
        uint256 takingAmount;
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 info,"
            "address makerAsset,"
            "address takerAsset,"
            "address maker,"
            "address allowedSender,"
            "uint256 makingAmount,"
            "uint256 takingAmount"
        ")"
    );

    function hash(OrderRFQ calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_RFQ_TYPEHASH;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_RFQ_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, 0xe0)
            result := keccak256(ptr, 0x100)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }
}
