// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type Traits is uint256;

library TraitsLib {
    uint256 private constant _ADDRESS_MASK = type(uint160).max;
    uint256 private constant _EXPIRATION_OFFSET = 160;
    uint256 private constant _EXPIRATION_MASK = type(uint40).max;
    uint256 private constant _NONCE_OFFSET = 200;
    uint256 private constant _NONCE_MASK = type(uint40).max;
    uint256 private constant _NO_PARIAL_FILLS_FLAG = 1 << 255;
    uint256 private constant _NO_IMPROVE_RATE_FLAG = 1 << 254;

    function isAllowedSender(Traits traits, address sender) internal pure returns (bool) {
        address allowedSender = address(uint160(Traits.unwrap(traits) & _ADDRESS_MASK));
        return allowedSender == address(0) || allowedSender == sender;
    }

    function isExpired(Traits traits) internal view returns (bool) {
        uint256 expiration = (Traits.unwrap(traits) >> _EXPIRATION_OFFSET) & _EXPIRATION_MASK;
        return expiration != 0 && block.timestamp >= expiration;  // solhint-disable-line not-rely-on-time
    }

    // TODO: inherit OrderMixin from NonceManager and use this order.trait.nonce()
    function nonce(Traits traits) internal pure returns (uint256) {
        return (Traits.unwrap(traits) >> _NONCE_OFFSET) & _NONCE_MASK;
    }

    function allowPartialFills(Traits traits) internal pure returns (bool) {
        return (Traits.unwrap(traits) & _NO_PARIAL_FILLS_FLAG) == 0;
    }

    function allowImproveRate(Traits traits) internal pure returns (bool) {
        return (Traits.unwrap(traits) & _NO_IMPROVE_RATE_FLAG) == 0;
    }
}
