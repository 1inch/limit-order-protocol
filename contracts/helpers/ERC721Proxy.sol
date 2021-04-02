// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

abstract contract ERC721Proxy is ImmutableOwner {
    // func_40aVqeY(address,address,uint256,address) = transferFrom + 2 = 0x23b872df
    function func_40aVqeY(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.transferFrom(from, to, tokenId);
    }

    // func_20xtkDI(address,address,uint256,address) == transferFrom + 3 = 0x23b872e0
    function func_20xtkDI(address from, address to, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId);
    }
}

/* solhint-enable func-name-mixedcase */
