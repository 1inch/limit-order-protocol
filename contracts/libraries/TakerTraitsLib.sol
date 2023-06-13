// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

type TakerTraits is uint256;

/**
 * @title TakerTraitsLib
 * @notice This library to manage and check TakerTraits, which are used to encode the taker's preferences for an order in a single uint256.
 * @dev The TakerTraits are structured as follows:
 * High bits are used for flags
 * 255 bit `_MAKER_AMOUNT_FLAG`         - If set, the taking amount is calculated based on making amount, otherwise making amount is calculated based on taking amount.
 * 254 bit `_UNWRAP_WETH_FLAG`          - If set, the WETH will be unwrapped into ETH before sending to taker.
 * 253 bit `_SKIP_ORDER_PERMIT_FLAG`    - If set, the order skips maker's permit execution.
 * 252 bit `_USE_PERMIT2_FLAG`          - If set, the order uses the permit2 function for authorization.
 * The remaining bits are used to store the threshold amount (the maximum amount a taker agrees to give in exchange for a making amount).
 */
library TakerTraitsLib {
    uint256 private constant _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 private constant _UNWRAP_WETH_FLAG = 1 << 254;
    uint256 private constant _SKIP_ORDER_PERMIT_FLAG = 1 << 253;
    uint256 private constant _USE_PERMIT2_FLAG = 1 << 252;
    uint256 private constant _AMOUNT_MASK = ~(
        _MAKER_AMOUNT_FLAG |
        _UNWRAP_WETH_FLAG |
        _SKIP_ORDER_PERMIT_FLAG |
        _USE_PERMIT2_FLAG
    );

    /**
     * @notice Checks if the taking amount should be calculated based on making amount.
     * @param takerTraits The traits of the taker.
     * @return result A boolean indicating whether the taking amount should be calculated based on making amount.
     */
    function isMakingAmount(TakerTraits takerTraits) internal pure returns (bool) {
        return (TakerTraits.unwrap(takerTraits) & _MAKER_AMOUNT_FLAG) != 0;
    }

    /**
     * @notice Checks if the order should unwrap WETH and send ETH to taker.
     * @param takerTraits The traits of the taker.
     * @return result A boolean indicating whether the order should unwrap WETH.
     */
    function unwrapWeth(TakerTraits takerTraits) internal pure returns (bool) {
        return (TakerTraits.unwrap(takerTraits) & _UNWRAP_WETH_FLAG) != 0;
    }

    /**
     * @notice Checks if the order should skip maker's permit execution.
     * @param takerTraits The traits of the taker.
     * @return result A boolean indicating whether the order don't apply permit.
     */
    function skipMakerPermit(TakerTraits takerTraits) internal pure returns (bool) {
        return (TakerTraits.unwrap(takerTraits) & _SKIP_ORDER_PERMIT_FLAG) != 0;
    }

    /**
     * @notice Checks if the order uses the permit2 instead of permit.
     * @param takerTraits The traits of the taker.
     * @return result A boolean indicating whether the order uses the permit2.
     */
    function usePermit2(TakerTraits takerTraits) internal pure returns (bool) {
        return (TakerTraits.unwrap(takerTraits) & _USE_PERMIT2_FLAG) != 0;
    }

    /**
     * @notice Retrieves the threshold amount from the takerTraits.
     * The maximum amount a taker agrees to give in exchange for a making amount.
     * @param takerTraits The traits of the taker.
     * @return result The threshold amount encoded in the takerTraits.
     */
    function threshold(TakerTraits takerTraits) internal pure returns (uint256) {
        return TakerTraits.unwrap(takerTraits) & _AMOUNT_MASK;
    }
}
