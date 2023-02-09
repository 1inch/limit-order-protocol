// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type Constraints is uint256;

library ConstraintsLib {
    uint256 private constant _ALLOWED_SENDER_MASK = type(uint160).max;
    uint256 private constant _EXPIRATION_OFFSET = 160;
    uint256 private constant _EXPIRATION_MASK = type(uint40).max;
    uint256 private constant _NONCE_OFFSET = 200;
    uint256 private constant _NONCE_MASK = type(uint40).max;
    uint256 private constant _SERIES_OFFSET = 240;
    uint256 private constant _SERIES_MASK = type(uint8).max;
    uint256 private constant _NO_PARIAL_FILLS_FLAG = 1 << 255;
    uint256 private constant _NO_IMPROVE_RATE_FLAG = 1 << 254;
    uint256 private constant _PRE_INTERACTION_CALL_FLAG = 1 << 253;
    uint256 private constant _POST_INTERACTION_CALL_FLAG = 1 << 252;

    function isAllowedSender(Constraints constraints, address sender) internal pure returns (bool) {
        address allowedSender = address(uint160(Constraints.unwrap(constraints) & _ALLOWED_SENDER_MASK));
        return allowedSender == address(0) || allowedSender == sender;
    }

    function isExpired(Constraints constraints) internal view returns (bool) {
        uint256 expiration = (Constraints.unwrap(constraints) >> _EXPIRATION_OFFSET) & _EXPIRATION_MASK;
        return expiration != 0 && expiration < block.timestamp;  // solhint-disable-line not-rely-on-time
    }

    function nonce(Constraints constraints) internal pure returns (uint256) {
        return (Constraints.unwrap(constraints) >> _NONCE_OFFSET) & _NONCE_MASK;
    }

    function series(Constraints constraints) internal pure returns (uint256) {
        return (Constraints.unwrap(constraints) >> _SERIES_OFFSET) & _SERIES_MASK;
    }

    function allowPartialFills(Constraints constraints) internal pure returns (bool) {
        return (Constraints.unwrap(constraints) & _NO_PARIAL_FILLS_FLAG) == 0;
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
}
