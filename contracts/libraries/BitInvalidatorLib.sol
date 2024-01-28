// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title BitInvalidatorLib
 * @dev The library provides a mechanism to invalidate objects based on a bit invalidator.
 * The bit invalidator holds a mapping where each key represents a slot number and each value contains an integer.
 * Each bit of the integer represents whether the object with corresponding index is valid or has been invalidated (0 - valid, 1 - invalidated).
 * The nonce given to access or invalidate an entity's state follows this structure:
 * - bits [0..7] represent the object state index in the slot.
 * - bits [8..255] represent the slot number (mapping key).
 */
library BitInvalidatorLib {
    /// @dev The error is thrown when an attempt is made to invalidate an already invalidated entity.
    error BitInvalidatedOrder();

    struct Data {
        mapping(uint256 slotIndex => uint256 slotData) _raw;
    }

    /**
     * @notice Retrieves the validity status of entities in a specific slot.
     * @dev Each bit in the returned value corresponds to the validity of an entity. 0 for valid, 1 for invalidated.
     * @param self The data structure.
     * @param nonce The nonce identifying the slot.
     * @return result The validity status of entities in the slot as a uint256.
     */
    function checkSlot(Data storage self, uint256 nonce) internal view returns(uint256) {
        uint256 invalidatorSlot = nonce >> 8;
        return self._raw[invalidatorSlot];
    }

    /**
     * @notice Checks the validity of a specific entity and invalidates it if valid.
     * @dev Throws an error if the entity has already been invalidated.
     * @param self The data structure.
     * @param nonce The nonce identifying the slot and the entity.
     */
    function checkAndInvalidate(Data storage self, uint256 nonce) internal {
        uint256 invalidatorSlot = nonce >> 8;
        uint256 invalidatorBit = 1 << (nonce & 0xff);
        uint256 invalidator = self._raw[invalidatorSlot];
        if (invalidator & invalidatorBit == invalidatorBit) revert BitInvalidatedOrder();
        self._raw[invalidatorSlot] = invalidator | invalidatorBit;
    }

    /**
     * @notice Invalidates multiple entities in a single slot.
     * @dev The entities to be invalidated are identified by setting their corresponding bits to 1 in a mask.
     * @param self The data structure.
     * @param nonce The nonce identifying the slot.
     * @param additionalMask A mask of bits to be invalidated.
     * @return result Resulting validity status of entities in the slot as a uint256.
     */
    function massInvalidate(Data storage self, uint256 nonce, uint256 additionalMask) internal returns(uint256 result) {
        uint256 invalidatorSlot = nonce >> 8;
        uint256 invalidatorBits = (1 << (nonce & 0xff)) | additionalMask;
        result = self._raw[invalidatorSlot] | invalidatorBits;
        self._raw[invalidatorSlot] = result;
    }
}
