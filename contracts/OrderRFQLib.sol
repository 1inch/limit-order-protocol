// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

library OrderRFQLib {
    struct OrderRFQ {
        uint256 info;  // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
        address makerAsset;
        address takerAsset;
        address maker;
        address allowedSender;  // equals to Zero address on public orders
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

    function hash(OrderRFQ memory order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_RFQ_TYPEHASH;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_RFQ_TYPEHASH, order));
            mstore(ptr, typehash)
            mstore(add(ptr, 0x20), mload(order))
            mstore(add(ptr, 0x40), mload(add(order, 0x20)))
            mstore(add(ptr, 0x60), mload(add(order, 0x40)))
            mstore(add(ptr, 0x80), mload(add(order, 0x60)))
            mstore(add(ptr, 0xa0), mload(add(order, 0x80)))
            mstore(add(ptr, 0xc0), mload(add(order, 0xa0)))
            mstore(add(ptr, 0xe0), mload(add(order, 0xc0)))
            let orderHash := keccak256(ptr, 0x100)

            // ECDSA.toTypedDataHash(domainSeparator, orderHash)
            mstore(ptr, 0x1901000000000000000000000000000000000000000000000000000000000000)
            mstore(add(ptr, 0x02), domainSeparator)
            mstore(add(ptr, 0x22), orderHash)
            result := keccak256(ptr, 66)
        }
    }
}
