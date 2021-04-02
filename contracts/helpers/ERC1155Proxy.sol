// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

abstract contract ERC1155Proxy is ImmutableOwner {
    constructor() {
        require(ERC1155Proxy.func_00cMjE8.selector == bytes4(uint32(IERC20.transferFrom.selector) + 4), "ERC1155Proxy: bad selector");
    }

    // keccak256("func_00cMjE8(address,address,uint256,address,uint256)") == 0x23b872e1
    function func_00cMjE8(address from, address to, uint256 amount, IERC1155 token, uint256 tokenId) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId, amount, "");
    }
}

/* solhint-enable func-name-mixedcase */
