// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

// packed struct Auction {
//     uint16 maxValue;
//     uint32 duration;
// }
type Auction is uint48;

library AuctionLib {
    using AuctionLib for Auction;

    uint256 constant internal _MAX_VALUE_BIT_OFFSET = 0;
    uint256 constant internal _MAX_VALUE_BIT_MASK = type(uint16).max;
    uint256 constant internal _DURATION_OFFSET = 16;
    uint256 constant internal _DURATION_BIT_MASK = type(uint32).max;

    function init(uint16 maxGasBump_, uint32 duration_) internal pure returns (Auction) {
        return Auction.wrap(
            (uint48(maxGasBump_) << uint48(_MAX_VALUE_BIT_OFFSET)) |
            (uint48(duration_) << uint48(_DURATION_OFFSET))
        );
    }

    function maxValue(Auction auction) internal pure returns (uint256) {
        return (Auction.unwrap(auction) >> _MAX_VALUE_BIT_OFFSET) & _MAX_VALUE_BIT_MASK;
    }

    function duration(Auction auction) internal pure returns (uint256) {
        return (Auction.unwrap(auction) >> _DURATION_OFFSET) & _DURATION_BIT_MASK;
    }

    function currentValue(Auction auction, uint256 started) public view returns (uint256) {
        if (block.timestamp <= started) return 0;
        if (block.timestamp >= started + auction.duration()) return auction.maxValue();
        return auction.maxValue() * (block.timestamp - started) / auction.duration();
    }
}
