// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title TakerFee Library
 * @notice Library to retrieve data from the bitmap.
 */
library FeeTakerLib {
    bytes1 private constant _RESOLVER_FEE_FLAG = 0x01;
    bytes1 private constant _INTEGRATOR_FEE_FLAG = 0x02;
    bytes1 private constant _CUSTOM_RECEIVER_FLAG = 0x04;
    uint256 private constant _WHITELIST_SHIFT = 3;

    /**
     * @notice Checks if the resolver fee is enabled
     * @param extraData Data to be processed in the extension
     * @return True if the resolver fee is enabled
     */
    function resolverFeeEnabled(bytes calldata extraData) internal pure returns (bool) {
        return extraData[extraData.length - 1] & _RESOLVER_FEE_FLAG == _RESOLVER_FEE_FLAG;
    }

    /**
     * @notice Checks if the integrator fee is enabled
     * @param extraData Data to be processed in the extension
     * @return True if the integrator fee is enabled
     */
    function integratorFeeEnabled(bytes calldata extraData) internal pure returns (bool) {
        return extraData[extraData.length - 1] & _INTEGRATOR_FEE_FLAG == _INTEGRATOR_FEE_FLAG;
    }

    /**
     * @notice Checks if the custom receiver is enabled
     * @param extraData Data to be processed in the extension
     * @return True if the custom receiver is specified
     */
    function hasCustomReceiver(bytes calldata extraData) internal pure returns (bool) {
        return extraData[extraData.length - 1] & _CUSTOM_RECEIVER_FLAG == _CUSTOM_RECEIVER_FLAG;
    }

    /**
     * @notice Gets the number of resolvers in the whitelist
     * @param extraData Data to be processed in the extension
     * @return The number of resolvers in the whitelist
     */
    function resolversCount(bytes calldata extraData) internal pure returns (uint256) {
        return uint8(extraData[extraData.length - 1]) >> _WHITELIST_SHIFT;
    }
}
