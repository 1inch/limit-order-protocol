// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

abstract contract ERC1155Proxy is ImmutableOwner {
    // func_7000ksXmS(address,address,uint256,address,uint256) == transferFrom + 4 = 0x8d076e89
    function func_7000ksXmS(address from, address to, uint256 amount, IERC1155 token, uint256 tokenId) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId, amount, "");
    }
}

/* solhint-enable func-name-mixedcase */
