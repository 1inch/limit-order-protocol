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
 *
 * Getter-side features only run when the order's amount data actually routes through this contract: an
 * order assembled with empty taking-amount data prices at its plain ratio and skips every check encoded
 * here, which no amount getter can prevent. Order builders must treat the amount-getter fields as
 * load-bearing, and makers who need a fill-by deadline that survives such mis-assembly should carry the
 * announcement deadline in the post-interaction blob, which is not skippable.
 *
 * When chained behind a settlement that takes a surplus fee, the fill premium counts toward that
 * surplus: anything a fill pays above the settlement's scaled estimated taking amount is taxed at its
 * surplus percentage, and the estimate scales linearly with fill size while the premium does not, so a
 * quoter cannot pad it away exactly. Either accept that the protocol takes its surplus share of the
 * premium, or set the estimate with that in mind.
 */
contract FusionAnchoredAuction is AmountGetterBase, IPostInteraction {
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei
    uint256 private constant _BASE_1E2 = 100;

    /// @dev Derive the auction start from the announcement instead of the timestamp baked into the order.
    bytes1 private constant _ANCHORED_FLAG = 0x01;
    /// @dev Price a fill by how much of the order it leaves unfilled, linearly.
    bytes1 private constant _FILL_SCALED_FLAG = 0x02;
    /// @dev Stop the order being fillable some time after its auction ends.
    bytes1 private constant _POST_AUCTION_DEADLINE_FLAG = 0x04;
    /// @dev Price a fill by a piecewise premium curve over the order's volume ladder.
    bytes1 private constant _FILL_CURVE_FLAG = 0x08;

    /// @dev Exclusivity-blob flag: stop the order being fillable some time after its announcement.
    /// Lives in the post-interaction's own flag byte; 0x02 is reserved there to keep the numbering
    /// clear of the auction's fill-scaled slot.
    bytes1 private constant _ANNOUNCEMENT_DEADLINE_FLAG = 0x04;

    /// @dev Fill shares are measured in 1e4.
    uint256 private constant _SHARE_BASE = 10_000;

    /// @dev The order relies on its announcement but has never been announced.
    error OrderNotAnnounced();
    /// @dev The order is past the deadline that follows its auction.
    error AuctionExpired();
    /// @dev The taker may not fill the order yet.
    error AllowedTimeViolation();
    /// @dev Fill scaling is expressed in 1e2 and cannot exceed 100%.
    error InvalidFillScalingNumerator();
    /// @dev The linear rule and the premium curve cannot price the same order.
    error ConflictingFillPricing();
    /// @dev A premium that rises along the volume ladder would reward splitting a fill.
    error NonMonotonicFillCurve();
    /// @dev A flag was set that only means something in combination with another, absent one.
    error InvalidFlagCombination();

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
     * 3 bytes - announcement deadline delay, present when the announcement deadline flag is set
     * 1 byte - size of the whitelist
     * (bytes10,bytes2)[N] - whitelisted addresses and the time delta until the next one
     * bytes - custom data to call an extra post-interaction (optional)
     *
     * Whitelisted addresses are compared by their lowest 10 bytes, the same trade-off the settlement
     * contracts already make between calldata size and the cost of grinding a colliding address.
     *
     * The announcement deadline stops the order being fillable once `announcedAt + delay` has passed.
     * It requires the anchored flag — setting it alone reverts rather than silently doing nothing — and
     * exists as defense in depth for the getter-side post-auction deadline: an order whose taking-amount
     * data was assembled without routing through this contract skips every getter-side check, but a
     * post-interaction is not skippable, so the deadline here bounds the damage. It is measured from the
     * announcement rather than the auction finish, which the post-interaction does not know; to align the
     * two, encode `announcementDeadlineDelay = auctionStartDelay + auctionDuration + postAuctionWindow`.
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
                uint256 announcementTime = _announcedAt(orderHash);
                uint256 anchoredTime = announcementTime + uint24(bytes3(extraData[offset:offset + 3]));
                offset += 3;
                if (anchoredTime > allowedTime) allowedTime = anchoredTime;

                if (flags & _ANNOUNCEMENT_DEADLINE_FLAG != 0) {
                    // solhint-disable-next-line not-rely-on-time
                    if (block.timestamp > announcementTime + uint24(bytes3(extraData[offset:offset + 3]))) revert AuctionExpired();
                    offset += 3;
                }
            } else if (flags & _ANNOUNCEMENT_DEADLINE_FLAG != 0) {
                revert InvalidFlagCombination();
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
        (AuctionState memory state, bytes calldata fillCurve, bytes calldata tail) = _parseAuctionDetails(extraData, orderHash);
        uint256 unbumpedAmount = super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail);

        uint256 rateBump = state.auctionBump;
        if (state.fillScalingNumerator != 0 || fillCurve.length != 0) {
            // The curve is enforced non-increasing, so its initial premium is the worst it can price at.
            uint256 worstRateBump = fillCurve.length != 0
                ? state.auctionBump + uint24(bytes3(fillCurve[0:3]))
                : _scaleByFill(state, order.makingAmount, 0, remainingMakingAmount);
            uint256 estimatedMakingAmount = Math.mulDiv(unbumpedAmount, _BASE_POINTS, _BASE_POINTS + _applyGasBump(worstRateBump, state.gasBump));
            rateBump = _rateBumpForFill(state, fillCurve, order.makingAmount, estimatedMakingAmount, remainingMakingAmount);
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
        (AuctionState memory state, bytes calldata fillCurve, bytes calldata tail) = _parseAuctionDetails(extraData, orderHash);
        uint256 rateBump = _applyGasBump(_rateBumpForFill(state, fillCurve, order.makingAmount, makingAmount, remainingMakingAmount), state.gasBump);
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
     *     FillCurve fillCurve;           // present when the fill curve flag is set
     *     bytes1 pointsCount;
     *     (bytes3,bytes2)[N] pointsAndTimeDeltas;
     * }
     *
     * struct FillCurve {
     *     bytes3 initialFillPremium;
     *     bytes1 fillPointsCount;
     *     (bytes3,bytes2)[M] premiumsAndShareDeltas;
     * }
     * ```
     * An anchored auction starts at the later of its announcement plus the start delay and the timestamp
     * baked into the order, so a maker may still ask for an auction that begins some time after it announces.
     * The linear rule and the premium curve are two encodings of the same feature, so an order may carry
     * only one of them.
     * @return state The parsed auction.
     * @return fillCurve The premium curve over fill shares, empty when the order does not carry one.
     * @return tail Remaining calldata after the auction.
     */
    function _parseAuctionDetails(bytes calldata auctionDetails, bytes32 orderHash) private view returns (AuctionState memory state, bytes calldata fillCurve, bytes calldata tail) {
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
                if (flags & _FILL_CURVE_FLAG != 0) revert ConflictingFillPricing();
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

            if (flags & _FILL_CURVE_FLAG != 0) {
                uint256 fillCurveLength = 4 + 5 * uint256(uint8(auctionDetails[offset + 3]));
                fillCurve = auctionDetails[offset:offset + fillCurveLength];
                offset += fillCurveLength;
            } else {
                fillCurve = auctionDetails[0:0];
            }

            state.gasBump = gasBumpEstimate == 0 || gasPriceEstimate == 0 ? 0 : gasBumpEstimate * block.basefee / gasPriceEstimate / _GAS_PRICE_BASE;
            state.initialRateBump = initialRateBump;
            (state.auctionBump, tail) = _getAuctionBump(auctionStartTime, auctionFinishTime, initialRateBump, auctionDetails[offset:]);
        }
    }

    /**
     * @dev Routes a fill to whichever share-dependent pricing the order carries, or to the plain curve.
     */
    function _rateBumpForFill(AuctionState memory state, bytes calldata fillCurve, uint256 orderMakingAmount, uint256 makingAmount, uint256 remainingMakingAmount) private pure returns (uint256) {
        unchecked {
            if (fillCurve.length != 0) {
                if (makingAmount >= remainingMakingAmount) return state.auctionBump;
                return state.auctionBump + _fillPremium(orderMakingAmount, makingAmount, remainingMakingAmount, fillCurve);
            }
            return _scaleByFill(state, orderMakingAmount, makingAmount, remainingMakingAmount);
        }
    }

    /**
     * @dev Reads the premium a fill pays from the piecewise curve over the order's own volume ladder.
     * A fill is priced at the rung its cumulative end lands on: shares are measured in 1e4 of the order's
     * original making amount, counted from everything filled before, so on a matrix with rows every tenth
     * the first tenth prices at the 1/10 row, the next tenth at the 2/10 row, and whoever completes the
     * order — in one sweep or as the last of many fills — pays no premium at all. The curve is built the
     * way the auction's own time curve is: it starts at `initialFillPremium` for a vanishing first fill,
     * runs through `M` points, and ends at an implied final point of zero premium at the full amount. That
     * is how a quote's matrix of rates per size is carried into the order: one point per matrix row, hit
     * exactly at its share, interpolated linearly in between so there are no cliffs for a taker to game.
     * The premium must not increase along the ladder, and the walk enforces that lazily — one comparison
     * per visited point, validating exactly the prefix the fill is priced on. A rising stretch would make
     * two fills cheaper than their sum and so pay takers to split; it reverts instead of pricing.
     * @param orderMakingAmount The order's original making amount, the ladder the curve is drawn over.
     * @param makingAmount The making amount of this fill, strictly below the remainder.
     * @param remainingMakingAmount The making amount left on the order before this fill.
     * @param fillCurve The packed curve: 3 bytes initial premium, 1 byte count, (3 bytes, 2 bytes) points.
     * @return The premium this fill pays on top of the time curve's rate bump.
     */
    function _fillPremium(uint256 orderMakingAmount, uint256 makingAmount, uint256 remainingMakingAmount, bytes calldata fillCurve) private pure returns (uint256) {
        unchecked {
            uint256 currentPremium = uint24(bytes3(fillCurve[0:3]));
            uint256 share = Math.mulDiv(orderMakingAmount - remainingMakingAmount + makingAmount, _SHARE_BASE, orderMakingAmount);
            if (share == 0) return currentPremium;

            uint256 currentShare = 0;
            uint256 pointsCount = uint8(fillCurve[3]);
            bytes calldata points = fillCurve[4:];
            for (uint256 i = 0; i < pointsCount; i++) {
                uint256 nextPremium = uint24(bytes3(points[:3]));
                if (nextPremium > currentPremium) revert NonMonotonicFillCurve();
                uint256 nextShare = currentShare + uint16(bytes2(points[3:5]));
                if (share <= nextShare) {
                    return ((share - currentShare) * nextPremium + (nextShare - share) * currentPremium) / (nextShare - currentShare);
                }
                currentPremium = nextPremium;
                currentShare = nextShare;
                points = points[5:];
            }
            return (_SHARE_BASE - share) * currentPremium / (_SHARE_BASE - currentShare);
        }
    }

    /**
     * @dev Prices a fill by where its cumulative end lands on the order's volume: a fill that leaves a
     * share `u` of the order unfilled keeps that share of the auction's released discount withheld, which
     * is worse for the taker the less of the order its fill completes.
     *
     * ```
     * effectiveBump = auctionBump + (initialRateBump - auctionBump) * u * fillScalingNumerator
     * u = (remainingMakingAmount - makingAmount) / order.makingAmount
     * ```
     *
     * Successive fills therefore walk down the ladder — each pays less premium than the one before — and
     * whoever completes the order, in one sweep or as the last of many fills, pays the plain auction price.
     * @param orderMakingAmount The order's original making amount, the ladder the premium is drawn over.
     * @param makingAmount The making amount of this fill.
     * @param remainingMakingAmount The making amount left on the order before this fill.
     * @return The rate bump this fill is priced at, before gas costs are offset.
     */
    function _scaleByFill(AuctionState memory state, uint256 orderMakingAmount, uint256 makingAmount, uint256 remainingMakingAmount) private pure returns (uint256) {
        unchecked {
            uint256 rateBump = state.auctionBump;
            if (state.fillScalingNumerator == 0 || makingAmount >= remainingMakingAmount || state.initialRateBump <= rateBump) {
                return rateBump;
            }
            uint256 unreleasedBump = Math.mulDiv(
                state.initialRateBump - rateBump,
                remainingMakingAmount - makingAmount,
                orderMakingAmount
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
