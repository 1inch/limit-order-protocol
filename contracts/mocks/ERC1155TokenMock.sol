// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/**
 * @title Minimal ERC-1155 with open minting
 * @notice Test-only. Needed to exercise `ERC1155Proxy`, which calls
 * `safeTransferFrom(from, to, tokenId, amount, data)`.
 */
contract ERC1155TokenMock is ERC1155 {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory uri_) ERC1155(uri_) {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }
}
