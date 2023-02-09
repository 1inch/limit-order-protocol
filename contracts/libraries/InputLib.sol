// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type Input is uint256;

library InputLib {
    uint256 private constant _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 private constant _UNWRAP_WETH_FLAG = 1 << 254;
    uint256 private constant _SKIP_ORDER_PERMIT_FLAG = 1 << 253;
    uint256 private constant _AMOUNT_MASK = ~(
        _MAKER_AMOUNT_FLAG |
        _UNWRAP_WETH_FLAG |
        _SKIP_ORDER_PERMIT_FLAG
    );

    function isMakingAmount(Input input) internal pure returns (bool) {
        return (Input.unwrap(input) & _MAKER_AMOUNT_FLAG) != 0;
    }

    function needUnwrapWeth(Input input) internal pure returns (bool) {
        return (Input.unwrap(input) & _UNWRAP_WETH_FLAG) != 0;
    }

    function skipOrderPermit(Input input) internal pure returns (bool) {
        return (Input.unwrap(input) & _SKIP_ORDER_PERMIT_FLAG) != 0;
    }

    function amount(Input input) internal pure returns (uint256) {
        return Input.unwrap(input) & _AMOUNT_MASK;
    }
}
