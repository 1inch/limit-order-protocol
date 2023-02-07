// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

type TraitsRFQ is uint256;

library TraitsRFQLib {
    uint256 private constant _LOW_160_BIT_MASK = type(uint160).max;
    uint256 private constant _NO_PARIAL_FILLS_FLAG = 1 << 255;
    uint256 private constant _NO_IMPROVE_RATE_FLAG = 1 << 254;

    function allowedSender(TraitsRFQ traits) internal pure returns (address) {
        return address(uint160(TraitsRFQ.unwrap(traits) & _LOW_160_BIT_MASK));
    }

    function allowPartialFills(TraitsRFQ traits) internal pure returns (bool) {
        return (TraitsRFQ.unwrap(traits) & _NO_PARIAL_FILLS_FLAG) == 0;
    }

    function allowImproveRate(TraitsRFQ traits) internal pure returns (bool) {
        return (TraitsRFQ.unwrap(traits) & _NO_IMPROVE_RATE_FLAG) == 0;
    }
}

library OrderRFQLib {
    struct OrderRFQ {
        uint256 info;  // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
        Address makerAsset;
        Address takerAsset;
        TraitsRFQ traits;
        uint256 makingAmount;
        uint256 takingAmount;
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 info,"
            "address makerAsset,"
            "address takerAsset,"
            "uint256 traits,"
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
            calldatacopy(add(ptr, 0x20), order, 0xc0)
            result := keccak256(ptr, 0xe0)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }
}
