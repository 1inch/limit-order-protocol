// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./ImmutableOwner.sol";


/* solhint-disable func-name-mixedcase */

contract ERC1155Proxy is ImmutableOwner {
    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        require(ERC1155Proxy.func_301JL5R.selector == IERC20.transferFrom.selector, "ERC1155Proxy: bad selector");
    }

    /// @notice Proxy transfer method for `IERC1155.safeTransferFrom`. Selector must match `IERC20.transferFrom`
    // keccak256("func_301JL5R(address,address,uint256,address,uint256,bytes)") == 0x23b872dd (IERC20.transferFrom)
    function func_301JL5R(address from, address to, uint256 amount, IERC1155 token, uint256 tokenId, bytes calldata data) external onlyImmutableOwner {
        token.safeTransferFrom(from, to, tokenId, amount, data);
    }
}

/* solhint-enable func-name-mixedcase */
