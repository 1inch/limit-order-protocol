// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./OrderMixin.sol";

/// @title 1inch Pro Limit Order Protocol
contract LimitOrderProtocolPro is
    EIP712("1inch Pro Limit Order Protocol", "1"),
    OrderMixin
{
    constructor(IWETH _weth) OrderMixin(_weth) {}  // solhint-disable-line no-empty-blocks

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns(bytes32) {
        return _domainSeparatorV4();
    }
}
