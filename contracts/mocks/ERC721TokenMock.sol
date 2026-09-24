// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title Minimal ERC-721 with open minting
 * @notice Test-only. Needed to exercise `ERC721ProxySafe`, which calls
 * `safeTransferFrom` and so cannot be driven by the ERC-20 `TokenMock` that
 * the plain `ERC721Proxy` example borrows.
 */
contract ERC721TokenMock is ERC721 {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
