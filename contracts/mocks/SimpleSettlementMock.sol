// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { FeeTaker } from "../extensions/FeeTaker.sol";

/**
 * @title SimpleSettlementMock
 * @dev Mirrors the auction and resolver whitelist of the SimpleSettlement contract deployed from
 * `limit-order-settlement`, which cannot be imported here because it compiles at an older Solidity version.
 * It exists so that {FusionAnchoredAuction} can be tested in the position it actually occupies in a Fusion
 * order — chained behind the settlement contract — and so that its unanchored pricing can be compared
 * against the pricing it has to reproduce. Surplus fees and the priority fee check are left out; they do
 * not participate in either.
 */
contract SimpleSettlementMock is FeeTaker {
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei

    error AllowedTimeViolation();

    constructor(address limitOrderProtocol, IERC20 accessToken, address weth, address owner)
        FeeTaker(limitOrderProtocol, accessToken, weth, owner)
    {}

    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (uint256 rateBump, bytes calldata tail) = _getRateBump(extraData);
        return Math.mulDiv(
            super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail),
            _BASE_POINTS,
            _BASE_POINTS + rateBump
        );
    }

    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (uint256 rateBump, bytes calldata tail) = _getRateBump(extraData);
        return Math.mulDiv(
            super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail),
            _BASE_POINTS + rateBump,
            _BASE_POINTS,
            Math.Rounding.Ceil
        );
    }

    function _isWhitelistedPostInteractionImpl(bytes calldata whitelistData, address taker) internal view override returns (bool isWhitelisted, bytes calldata tail) {
        unchecked {
            uint80 maskedTakerAddress = uint80(uint160(taker));
            uint256 allowedTime = uint32(bytes4(whitelistData));
            uint256 size = uint8(whitelistData[4]);
            bytes calldata whitelist = whitelistData[5:5 + 12 * size];
            tail = whitelistData[5 + 12 * size:];

            for (uint256 i = 0; i < size; i++) {
                uint80 whitelistedAddress = uint80(bytes10(whitelist));
                // solhint-disable-next-line not-rely-on-time
                if (block.timestamp < allowedTime) {
                    revert AllowedTimeViolation();
                } else if (maskedTakerAddress == whitelistedAddress) {
                    return (true, tail);
                }
                allowedTime += uint16(bytes2(whitelist[10:])); // add next time delta
                whitelist = whitelist[12:];
            }
            // solhint-disable-next-line not-rely-on-time
            if (block.timestamp < allowedTime) {
                revert AllowedTimeViolation();
            }
        }
    }

    function _getRateBump(bytes calldata auctionDetails) private view returns (uint256, bytes calldata) {
        unchecked {
            uint256 gasBumpEstimate = uint24(bytes3(auctionDetails[0:3]));
            uint256 gasPriceEstimate = uint32(bytes4(auctionDetails[3:7]));
            uint256 gasBump = gasBumpEstimate == 0 || gasPriceEstimate == 0 ? 0 : gasBumpEstimate * block.basefee / gasPriceEstimate / _GAS_PRICE_BASE;
            uint256 auctionStartTime = uint32(bytes4(auctionDetails[7:11]));
            uint256 auctionFinishTime = auctionStartTime + uint24(bytes3(auctionDetails[11:14]));
            uint256 initialRateBump = uint24(bytes3(auctionDetails[14:17]));
            (uint256 auctionBump, bytes calldata tail) = _getAuctionBump(auctionStartTime, auctionFinishTime, initialRateBump, auctionDetails[17:]);
            return (auctionBump > gasBump ? auctionBump - gasBump : 0, tail);
        }
    }

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
