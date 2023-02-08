// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type Traits is uint256;

library TraitsLib {
    uint256 private constant _LOW_160_BIT_MASK = type(uint160).max;
    uint256 private constant _EXPIRATION_OFFSET = 160;
    uint256 private constant _EXPIRATION_MASK = 0xffffffffff;
    uint256 private constant _NO_PARIAL_FILLS_FLAG = 1 << 255;
    uint256 private constant _NO_IMPROVE_RATE_FLAG = 1 << 254;

    function isAllowedSender(Traits traits, address sender) internal pure returns (bool) {
        address allowedSender = address(uint160(Traits.unwrap(traits) & _LOW_160_BIT_MASK));
        return allowedSender == address(0) || allowedSender == sender;
    }

    function isExpired(Traits traits) internal view returns (bool) {
        uint256 expiration = (Traits.unwrap(traits) >> _EXPIRATION_OFFSET) & _EXPIRATION_MASK;
        return expiration != 0 && block.timestamp >= expiration;
    }

    function allowPartialFills(Traits traits) internal pure returns (bool) {
        return (Traits.unwrap(traits) & _NO_PARIAL_FILLS_FLAG) == 0;
    }

    function allowImproveRate(Traits traits) internal pure returns (bool) {
        return (Traits.unwrap(traits) & _NO_IMPROVE_RATE_FLAG) == 0;
    }
}
