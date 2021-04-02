// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

abstract contract ERC721Proxy is ImmutableOwner {
    // func_4002L9TKH(address,address,uint256,address) = transferFrom + 2 = 0x8d076e87
    function func_4002L9TKH(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.transferFrom(from, to, tokenId);
    }

    // func_2000nVqcj(address,address,uint256,address) == transferFrom + 3 = 0x8d076e88
    function func_2000nVqcj(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId);
    }
}

/* solhint-enable func-name-mixedcase */
