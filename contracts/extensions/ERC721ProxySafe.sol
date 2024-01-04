// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

contract ERC721ProxySafe is ImmutableOwner {
    error ERC721ProxySafeBadSelector();

    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        if (ERC721ProxySafe.func_60iHVgK.selector != IERC20.transferFrom.selector) revert ERC721ProxySafeBadSelector();
    }

    /// @notice Proxy transfer method for `IERC721.transferFrom`. Selector must match `IERC20.transferFrom`.
    /// Note that `amount` is unused for security reasons to prevent unintended ERC-721 token sale via partial fill
    // keccak256("func_60iHVgK(address,address,uint256,uint256,address)" == 0x23b872dd (IERC20.transferFrom)
    function func_60iHVgK(address from, address to, uint256 /* amount */, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId);
    }
}

/* solhint-enable func-name-mixedcase */
