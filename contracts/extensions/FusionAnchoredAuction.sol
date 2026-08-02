// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";
import { IPostInteraction } from "../interfaces/IPostInteraction.sol";
import { AmountGetterBase } from "./AmountGetterBase.sol";

/**
 * @title FusionAnchoredAuction
 * @notice Dutch auction whose schedule may be anchored to the moment an order was announced on-chain,
 * and whose price may depend on how much of the order a taker fills.
 *
 * @dev An absolute auction start baked into an order at build time is missed by a maker that signs slowly —
 * a multisig collecting signatures, for instance — and such an order degrades to the auction floor price.
 * Anchoring reads the announcement recorded by {OrderRegistrator} and starts the auction from it instead,
 * so a slow maker gets the same price curve a fast one gets.
 *
 * The contract is a standalone amount getter and post-interaction rather than a settlement subclass. It is
 * referenced by address from the order extension, either directly or chained after a settlement contract
 * through the amount-getter and post-interaction chains, and so works with any deployed settlement version.
 * Every feature is opt-in per order through the flags byte; with no flags set the pricing matches an
 * unanchored Dutch auction.
 */
contract FusionAnchoredAuction is AmountGetterBase, IPostInteraction {
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei
    uint256 private constant _BASE_1E2 = 100;

    /// @dev Derive the auction start from the announcement instead of the timestamp baked into the order.
    bytes1 private constant _ANCHORED_FLAG = 0x01;
    /// @dev Price a fill according to the share of the order it takes.
    bytes1 private constant _FILL_SCALED_FLAG = 0x02;
    /// @dev Stop the order being fillable some time after its auction ends.
    bytes1 private constant _POST_AUCTION_DEADLINE_FLAG = 0x04;

    /// @dev The order relies on its announcement but has never been announced.
    error OrderNotAnnounced();
    /// @dev The order is past the deadline that follows its auction.
    error AuctionExpired();
    /// @dev The taker may not fill the order yet.
    error AllowedTimeViolation();
    /// @dev Fill scaling is expressed in 1e2 and cannot exceed 100%.
    error InvalidFillScalingNumerator();

    IOrderRegistrator private immutable _ORDER_REGISTRATOR;

    /// @dev State parsed out of the auction details, in the form the rate bump is computed from.
    struct AuctionState {
        uint256 auctionBump;
        uint256 initialRateBump;
        uint256 gasBump;
        uint256 fillScalingNumerator;
    }

    /**
     * @notice Initializes the contract.
     * @param orderRegistrator The registrator whose announcements anchored orders are priced from.
     */
    constructor(IOrderRegistrator orderRegistrator) {
        _ORDER_REGISTRATOR = orderRegistrator;
    }

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Holds resolver exclusivity relative to the announcement. An order whose exclusivity is expressed
     * as absolute timestamps has already passed all of its windows by the time a late announcement lands,
     * so a settlement contract lets every resolver in at once; this restores the windows the maker asked for.
     * Anchored orders should therefore leave the settlement's own allowed time non-blocking.
     *
     * The function moves no funds and only reverts, so it is deliberately callable by anyone: when chained
     * from a settlement contract the caller is that contract rather than the limit order protocol, and a
     * caller check would break the composition.
     *
     * `extraData` consists of:
     * 1 byte - flags
     * 4 bytes - allowed time
     * 3 bytes - allowed time delay, present when the anchored flag is set
     * 1 byte - size of the whitelist
     * (bytes10,bytes2)[N] - whitelisted addresses and the time delta until the next one
     * bytes - custom data to call an extra post-interaction (optional)
     *
     * Whitelisted addresses are compared by their lowest 10 bytes, the same trade-off the settlement
     * contracts already make between calldata size and the cost of grinding a colliding address.
     */
    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external {
        unchecked {
            bytes1 flags = extraData[0];
            uint256 allowedTime = uint32(bytes4(extraData[1:5]));
            uint256 offset = 5;

            if (flags & _ANCHORED_FLAG != 0) {
                uint256 anchoredTime = _announcedAt(orderHash) + uint24(bytes3(extraData[offset:offset + 3]));
                offset += 3;
                if (anchoredTime > allowedTime) allowedTime = anchoredTime;
            }

            uint256 size = uint8(extraData[offset]);
            offset += 1;
            bytes calldata whitelist = extraData[offset:offset + 12 * size];
            bytes calldata tail = extraData[offset + 12 * size:];

            uint80 maskedTakerAddress = uint80(uint160(taker));
            bool whitelisted;
            for (uint256 i = 0; i < size; i++) {
                // solhint-disable-next-line not-rely-on-time
                if (block.timestamp < allowedTime) revert AllowedTimeViolation();
                if (maskedTakerAddress == uint80(bytes10(whitelist))) {
                    whitelisted = true;
                    break;
                }
                allowedTime += uint16(bytes2(whitelist[10:])); // add next time delta
                whitelist = whitelist[12:];
            }
            // solhint-disable-next-line not-rely-on-time
            if (!whitelisted && block.timestamp < allowedTime) revert AllowedTimeViolation();

            if (tail.length > 19) {
                IPostInteraction(address(bytes20(tail))).postInteraction(
                    order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, tail[20:]
                );
            }
        }
    }

    /**
     * @dev Applies the auction to the making amount. The fill share is not known here — it is the value
     * being computed — so it is estimated at the worst rate bump the auction can produce and the price is
     * then recomputed from that estimate. The estimate can only understate the share and therefore only
     * overstate the rate bump, so the result never exceeds the amount an exact solution would return.
     */
    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (AuctionState memory state, bytes calldata tail) = _parseAuctionDetails(extraData, orderHash);
        uint256 unbumpedAmount = super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail);

        uint256 rateBump = state.auctionBump;
        if (state.fillScalingNumerator != 0) {
            uint256 worstRateBump = _scaleByFill(state, 0, remainingMakingAmount);
            uint256 estimatedMakingAmount = Math.mulDiv(unbumpedAmount, _BASE_POINTS, _BASE_POINTS + _applyGasBump(worstRateBump, state.gasBump));
            rateBump = _scaleByFill(state, estimatedMakingAmount, remainingMakingAmount);
        }

        return Math.mulDiv(unbumpedAmount, _BASE_POINTS, _BASE_POINTS + _applyGasBump(rateBump, state.gasBump));
    }

    /**
     * @dev Applies the auction to the taking amount, where the fill share is known exactly.
     */
    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (AuctionState memory state, bytes calldata tail) = _parseAuctionDetails(extraData, orderHash);
        uint256 rateBump = _applyGasBump(_scaleByFill(state, makingAmount, remainingMakingAmount), state.gasBump);
        return Math.mulDiv(
            super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail),
            _BASE_POINTS + rateBump,
            _BASE_POINTS,
            Math.Rounding.Ceil
        );
    }

    /**
     * @dev Parses the auction and resolves everything about it that does not depend on the fill size.
     * `auctionDetails` is a tightly packed struct of the following format:
     * ```
     * struct AuctionDetails {
     *     bytes1 flags;
     *     bytes3 gasBumpEstimate;
     *     bytes4 gasPriceEstimate;
     *     bytes4 auctionStartTime;
     *     bytes3 auctionDuration;
     *     bytes3 initialRateBump;
     *     bytes3 auctionStartDelay;      // present when the anchored flag is set
     *     bytes1 fillScalingNumerator;   // present when the fill scaled flag is set
     *     bytes3 postAuctionWindow;      // present when the post auction deadline flag is set
     *     bytes1 pointsCount;
     *     (bytes3,bytes2)[N] pointsAndTimeDeltas;
     * }
     * ```
     * An anchored auction starts at the later of its announcement plus the start delay and the timestamp
     * baked into the order, so a maker may still ask for an auction that begins some time after it announces.
     * @return state The parsed auction.
     * @return tail Remaining calldata after the auction.
     */
    function _parseAuctionDetails(bytes calldata auctionDetails, bytes32 orderHash) private view returns (AuctionState memory state, bytes calldata tail) {
        unchecked {
            bytes1 flags = auctionDetails[0];
            uint256 gasBumpEstimate = uint24(bytes3(auctionDetails[1:4]));
            uint256 gasPriceEstimate = uint32(bytes4(auctionDetails[4:8]));
            uint256 auctionStartTime = uint32(bytes4(auctionDetails[8:12]));
            uint256 auctionDuration = uint24(bytes3(auctionDetails[12:15]));
            uint256 initialRateBump = uint24(bytes3(auctionDetails[15:18]));
            uint256 offset = 18;

            if (flags & _ANCHORED_FLAG != 0) {
                uint256 anchoredStartTime = _announcedAt(orderHash) + uint24(bytes3(auctionDetails[offset:offset + 3]));
                offset += 3;
                if (anchoredStartTime > auctionStartTime) auctionStartTime = anchoredStartTime;
            }

            if (flags & _FILL_SCALED_FLAG != 0) {
                uint256 fillScalingNumerator = uint8(auctionDetails[offset]);
                offset += 1;
                if (fillScalingNumerator > _BASE_1E2) revert InvalidFillScalingNumerator();
                state.fillScalingNumerator = fillScalingNumerator;
            }

            uint256 auctionFinishTime = auctionStartTime + auctionDuration;

            if (flags & _POST_AUCTION_DEADLINE_FLAG != 0) {
                uint256 postAuctionWindow = uint24(bytes3(auctionDetails[offset:offset + 3]));
                offset += 3;
                // solhint-disable-next-line not-rely-on-time
                if (block.timestamp > auctionFinishTime + postAuctionWindow) revert AuctionExpired();
            }

            state.gasBump = gasBumpEstimate == 0 || gasPriceEstimate == 0 ? 0 : gasBumpEstimate * block.basefee / gasPriceEstimate / _GAS_PRICE_BASE;
            state.initialRateBump = initialRateBump;
            (state.auctionBump, tail) = _getAuctionBump(auctionStartTime, auctionFinishTime, initialRateBump, auctionDetails[offset:]);
        }
    }

    /**
     * @dev Prices a fill according to the share of the order it takes: a taker sweeping everything that is
     * left pays the auction price, and a taker filling a fraction `p` of it gets only that fraction of the
     * discount the auction has released so far, which is worse for the taker the smaller the fill is.
     *
     * ```
     * effectiveBump = auctionBump + (initialRateBump - auctionBump) * (1 - p) * fillScalingNumerator
     * ```
     *
     * The share is measured against the amount remaining rather than the original size, so an order that has
     * been partially filled can still be completed at the auction price.
     * @param makingAmount The making amount of this fill.
     * @param remainingMakingAmount The making amount left on the order before this fill.
     * @return The rate bump this fill is priced at, before gas costs are offset.
     */
    function _scaleByFill(AuctionState memory state, uint256 makingAmount, uint256 remainingMakingAmount) private pure returns (uint256) {
        unchecked {
            uint256 rateBump = state.auctionBump;
            if (state.fillScalingNumerator == 0 || makingAmount >= remainingMakingAmount || state.initialRateBump <= rateBump) {
                return rateBump;
            }
            uint256 unreleasedBump = Math.mulDiv(
                state.initialRateBump - rateBump,
                remainingMakingAmount - makingAmount,
                remainingMakingAmount
            );
            return rateBump + unreleasedBump * state.fillScalingNumerator / _BASE_1E2;
        }
    }

    /**
     * @dev Offsets the estimated transaction costs from the auction rate bump.
     */
    function _applyGasBump(uint256 rateBump, uint256 gasBump) private pure returns (uint256) {
        unchecked {
            return rateBump > gasBump ? rateBump - gasBump : 0;
        }
    }

    /**
     * @dev Reads the announcement of an order, reverting when it has never been announced.
     */
    function _announcedAt(bytes32 orderHash) private view returns (uint256) {
        uint256 announcedAt = _ORDER_REGISTRATOR.announcedAt(orderHash);
        if (announcedAt == 0) revert OrderNotAnnounced();
        return announcedAt;
    }

    /**
     * @dev Calculates auction price bump. Auction is represented as a piecewise linear function with `N` points.
     * Each point is represented as a pair of `(rateBump, timeDelta)`, where `rateBump` is the
     * rate bump in basis points and `timeDelta` is the time delta in seconds.
     * The rate bump is interpolated linearly between the points.
     * The last point is assumed to be `(0, auctionDuration)`.
     * @param auctionStartTime The time when the auction starts.
     * @param auctionFinishTime The time when the auction finishes.
     * @param initialRateBump The initial rate bump.
     * @param pointsAndTimeDeltas The points and time deltas structure.
     * @return The rate bump at the current time.
     * @return Remaining calldata after the parsed points.
     */
    function _getAuctionBump(
        uint256 auctionStartTime, uint256 auctionFinishTime, uint256 initialRateBump, bytes calldata pointsAndTimeDeltas
    ) private view returns (uint256, bytes calldata) {
        unchecked {
            uint256 currentPointTime = auctionStartTime;
            uint256 currentRateBump = initialRateBump;
            uint256 pointsCount = uint8(pointsAndTimeDeltas[0]);
            pointsAndTimeDeltas = pointsAndTimeDeltas[1:];
            bytes calldata tail = pointsAndTimeDeltas[5 * pointsCount:];

            // solhint-disable-next-line not-rely-on-time
            if (block.timestamp <= auctionStartTime) {
                return (initialRateBump, tail);
            // solhint-disable-next-line not-rely-on-time
            } else if (block.timestamp >= auctionFinishTime) {
                return (0, tail);
            }

            for (uint256 i = 0; i < pointsCount; i++) {
                uint256 nextRateBump = uint24(bytes3(pointsAndTimeDeltas[:3]));
                uint256 nextPointTime = currentPointTime + uint16(bytes2(pointsAndTimeDeltas[3:5]));
                // solhint-disable-next-line not-rely-on-time
                if (block.timestamp <= nextPointTime) {
                    // solhint-disable-next-line not-rely-on-time
                    return (((block.timestamp - currentPointTime) * nextRateBump + (nextPointTime - block.timestamp) * currentRateBump) / (nextPointTime - currentPointTime), tail);
                }
                currentRateBump = nextRateBump;
                currentPointTime = nextPointTime;
                pointsAndTimeDeltas = pointsAndTimeDeltas[5:];
            }
            // solhint-disable-next-line not-rely-on-time
            return ((auctionFinishTime - block.timestamp) * currentRateBump / (auctionFinishTime - currentPointTime), tail);
        }
    }
}
