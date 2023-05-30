// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title BitInvalidatorLib
 * @dev This library provides functionality to invalidate objects based on a bit invalidator.
 * The Data struct holds a mapping where each key represents a slot number and each value contains an integer.
 * Each bit of the integer represents whether the corresponding object is still valid or has been invalidated (0 - valid, 1 - invalidated).
 * To access an object's state or invalidate it, a nonce must be passed that identifies it, and follows the following rules:
 * - bits [0..7] represent the object state index in the slot.
 * - bits [8..255] represent the slot number (mapping key).
 */
library BitInvalidatorLib {
    /// @dev Error thrown when a bit has already been invalidated for an order.
    error BitInvalidatedOrder();

    struct Data {
        mapping(uint256 => uint256) _raw;
    }

    /**
     * @dev Returns the values for a specific slot.
     * @param self The data structure.
     * @param nonce The nonce specifing the slot.
     * @return uint256 The value of the specific slot.
     */
    function checkSlot(Data storage self, uint256 nonce) internal view returns(uint256) {
        uint256 invalidatorSlot = nonce >> 8;
        return self._raw[invalidatorSlot];
    }

    /**
     * @dev Invalidates the specific bit in the specific slot.
     * @param self The data structure.
     * @param nonce The nonce specifing the slot and the object index.
     */
    function checkAndInvalidate(Data storage self, uint256 nonce) internal {
        uint256 invalidatorSlot = nonce >> 8;
        uint256 invalidatorBit = 1 << (nonce & 0xff);
        uint256 invalidator = self._raw[invalidatorSlot];
        if (invalidator & invalidatorBit == invalidatorBit) revert BitInvalidatedOrder();
        self._raw[invalidatorSlot] = invalidator | invalidatorBit;
    }


    /**
     * @dev Invalidates multiple objects in a single slot.
     * @param self The data structure.
     * @param nonce The nonce specifing the slot.
     * @param additionalMask A mask of bits to be invalidated.
     */
    function massInvalidate(Data storage self, uint256 nonce, uint256 additionalMask) internal {
        uint256 invalidatorSlot = nonce >> 8;
        uint256 invalidatorBits = (1 << (nonce & 0xff)) | additionalMask;
        self._raw[invalidatorSlot] |= invalidatorBits;
    }
}
