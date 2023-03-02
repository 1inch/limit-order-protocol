// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

type Constraints is uint256;

library ConstraintsLib {
    // Low 200 bits are used for allowed sender, expiration, nonceOrEpoch, and series
    uint256 private constant _ALLOWED_SENDER_MASK = type(uint80).max;
    uint256 private constant _EXPIRATION_OFFSET = 80;
    uint256 private constant _EXPIRATION_MASK = type(uint40).max;
    uint256 private constant _NONCE_OR_EPOCH_OFFSET = 120;
    uint256 private constant _NONCE_OR_EPOCH_MASK = type(uint40).max;
    uint256 private constant _SERIES_OFFSET = 160;
    uint256 private constant _SERIES_MASK = type(uint40).max;

    uint256 private constant _NO_PARTIAL_FILLS_FLAG = 1 << 255;
    uint256 private constant _ALLOW_MULTIPLE_FILLS_FLAG = 1 << 254;
    uint256 private constant _NO_IMPROVE_RATE_FLAG = 1 << 253;
    uint256 private constant _PRE_INTERACTION_CALL_FLAG = 1 << 252;
    uint256 private constant _POST_INTERACTION_CALL_FLAG = 1 << 251;
    uint256 private constant _NEED_CHECK_EPOCH_MANAGER_FLAG = 1 << 250;
    uint256 private constant _HAS_EXTENSION_FLAG = 1 << 249;
    uint256 private constant _USE_PERMIT2_FLAG = 1 << 248;

    function hasExtension(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _HAS_EXTENSION_FLAG) != 0;
    }

    function isAllowedSender(Constraints constraints, address sender) internal pure returns (bool) {
        address allowedSender = address(uint160(Constraints.unwrap(constraints) & _ALLOWED_SENDER_MASK));
        return allowedSender == address(0) || (uint160(allowedSender) & _ALLOWED_SENDER_MASK) == uint160(sender) & _ALLOWED_SENDER_MASK;
    }

    function isExpired(Constraints constraints) internal view returns (bool) {
        uint256 expiration = (Constraints.unwrap(constraints) >> _EXPIRATION_OFFSET) & _EXPIRATION_MASK;
        return expiration != 0 && expiration < block.timestamp;  // solhint-disable-line not-rely-on-time
    }

    function nonceOrEpoch(Constraints constraints) internal pure returns (uint256) {
        return (Constraints.unwrap(constraints) >> _NONCE_OR_EPOCH_OFFSET) & _NONCE_OR_EPOCH_MASK;
    }

    function series(Constraints constraints) internal pure returns (uint256) {
        return (Constraints.unwrap(constraints) >> _SERIES_OFFSET) & _SERIES_MASK;
    }

    function allowPartialFills(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _NO_PARTIAL_FILLS_FLAG) == 0;
    }

    function allowImproveRateViaInteraction(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _NO_IMPROVE_RATE_FLAG) == 0;
    }

    function needPreInteractionCall(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _PRE_INTERACTION_CALL_FLAG) != 0;
    }

    function needPostInteractionCall(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _POST_INTERACTION_CALL_FLAG) != 0;
    }

    function allowMultipleFills(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _ALLOW_MULTIPLE_FILLS_FLAG) != 0;
    }

    function useBitInvalidator(Constraints constraints) internal pure returns (bool) {
        return !allowPartialFills(constraints) || !allowMultipleFills(constraints);
    }

    function needCheckEpochManager(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _NEED_CHECK_EPOCH_MANAGER_FLAG) != 0;
    }

    function usePermit2(Constraints constraints) internal pure returns (bool) {
        return Constraints.unwrap(constraints) & _USE_PERMIT2_FLAG != 0;
    }
}
