// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./OrderMixin.sol";

/// @title 1inch Pro Limit Order Protocol
contract LimitOrderProtocolPro is
    EIP712("1inch Pro Limit Order Protocol", "1"),
    OrderMixin
{
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns(bytes32) {
        return _domainSeparatorV4();
    }
}
