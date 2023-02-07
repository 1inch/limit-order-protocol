// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

library OrderRFQLib {
    // struct OrderRFQ {
    //     uint256 info;  // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
    //     Address makerAsset;
    //     Address takerAsset;
    //     Address allowedSender;  // equals to Zero address on public orders
    //     uint256 makingAmount;
    //     uint256 takingAmount;
    // }

    struct OrderRFQ {
        uint256 info;
        uint256 _raw1;
        uint256 _raw2;
        uint256 _raw3;
    }

    uint256 constant private _MAKER_ASSET_OFFSET = 32;
    uint256 constant private _TAKER_ASSET_OFFSET = 52;
    uint256 constant private _ALLOWED_SENDER_OFFSET = 72;
    uint256 constant private _MAKING_AMOUNT_OFFSET = 92;
    uint256 constant private _TAKING_AMOUNT_OFFSET = 106;

    function makerAsset(OrderRFQ calldata order) internal pure returns(address result) {
        assembly {
            result := shr(96, calldataload(add(order, _MAKER_ASSET_OFFSET)))
        }
    }

    function takerAsset(OrderRFQ calldata order) internal pure returns(address result) {
        assembly {
            result := shr(96, calldataload(add(order, _TAKER_ASSET_OFFSET)))
        }
    }

    function allowedSender(OrderRFQ calldata order) internal pure returns(address result) {
        assembly {
            result := shr(96, calldataload(add(order, _ALLOWED_SENDER_OFFSET)))
        }
    }

    function makingAmount(OrderRFQ calldata order) internal pure returns(uint256 result) {
        assembly {
            result := shr(144, calldataload(add(order, _MAKING_AMOUNT_OFFSET)))
        }
    }

    function takingAmount(OrderRFQ calldata order) internal pure returns(uint256 result) {
        assembly {
            result := shr(144, calldataload(add(order, _TAKING_AMOUNT_OFFSET)))
        }
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 info,"
            "uint256 _raw1,"
            "uint256 _raw2,"
            "uint256 _raw3"
        ")"
    );

    function hash(OrderRFQ calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_RFQ_TYPEHASH;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_RFQ_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, 0x80)
            result := keccak256(ptr, 0xa0)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }
}
