// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

type Limits is uint256;

library LimitsLib {
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

    function isMakingAmount(Limits limits) internal pure returns (bool) {
        return (Limits.unwrap(limits) & _MAKER_AMOUNT_FLAG) != 0;
    }

    function needUnwrapWeth(Limits limits) internal pure returns (bool) {
        return (Limits.unwrap(limits) & _UNWRAP_WETH_FLAG) != 0;
    }

    function skipOrderPermit(Limits limits) internal pure returns (bool) {
        return (Limits.unwrap(limits) & _SKIP_ORDER_PERMIT_FLAG) != 0;
    }

    function usePermit2(Limits limits) internal pure returns (bool) {
        return (Limits.unwrap(limits) & _USE_PERMIT2_FLAG) != 0;
    }

    function threshold(Limits limits) internal pure returns (uint256) {
        return Limits.unwrap(limits) & _AMOUNT_MASK;
    }
}
