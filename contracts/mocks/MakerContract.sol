// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../LimitOrderProtocol.sol";
import "../OrderLib.sol";
import { EIP712Alien } from "./EIP712Alien.sol";

contract MakerContract is IERC1271, EIP712Alien, ERC20 {
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;
    using AddressLib for Address;
    using MakerTraitsLib for MakerTraits;

    error NotAllowedToken();
    error BadPrice();
    error MalformedSignature();

    address immutable public PROTOCOL;
    IERC20 immutable public TOKEN0;
    IERC20 immutable public TOKEN1;
    uint256 immutable public FEE;
    uint256 immutable public FEE2;

    constructor(
        address _protocol,
        IERC20 _token0,
        IERC20 _token1,
        uint256 _fee,
        string memory name,
        string memory symbol
    )
        EIP712Alien(_protocol, "1inch Limit Order Protocol", "4")
        ERC20(name, symbol)
    {
        PROTOCOL = _protocol;
        TOKEN0 = _token0;
        TOKEN1 = _token1;
        FEE = _fee;
        FEE2 = 2e18 * _fee / (1e18 + _fee);
        _token0.approve(_protocol, type(uint256).max);
        _token1.approve(_protocol, type(uint256).max);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function deposit(IERC20 token, uint256 amount) public {
        depositFor(token, amount, msg.sender);
    }

    function depositFor(IERC20 token, uint256 amount, address to) public {
        if (token != TOKEN0 && token != TOKEN1) revert NotAllowedToken();

        _mint(to, amount * FEE2 / 1e18);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(IERC20 token, uint256 amount) public {
        withdrawFor(token, amount, msg.sender);
    }

    function withdrawFor(IERC20 token, uint256 amount, address to) public {
        if (token != TOKEN0 && token != TOKEN1) revert NotAllowedToken();

        _burn(msg.sender, amount);
        token.safeTransfer(to, amount * FEE2 / 1e18);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view override returns(bytes4) {
        if (signature.length != 8 * 0x20) revert MalformedSignature();

        IOrderMixin.Order calldata order;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            order := signature.offset
        }

        if (
            (
                (order.makerAsset.get() != address(TOKEN0) || order.takerAsset.get() != address(TOKEN1)) &&
                (order.makerAsset.get() != address(TOKEN1) || order.takerAsset.get() != address(TOKEN0))
            ) ||
            order.makerTraits.hasExtension() ||
            order.makingAmount * FEE > order.takingAmount * 1e18 ||
            order.hash(_domainSeparatorV4()) != hash
        ) revert BadPrice();

        return this.isValidSignature.selector;
    }
}
