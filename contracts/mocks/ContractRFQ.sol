// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../LimitOrderProtocol.sol";
import "../libraries/ArgumentsDecoder.sol";
import "./EIP712Alien.sol";

contract ContractRFQ is IERC1271, EIP712Alien, ERC20 {
    using SafeERC20 for IERC20;
    using ArgumentsDecoder for bytes;

    bytes32 constant public LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 info,"
            "address makerAsset,"
            "address takerAsset,"
            "address maker,"
            "address allowedSender,"
            "uint256 makingAmount,"
            "uint256 takingAmount"
        ")"
    );

    uint256 constant private _FROM_INDEX = 0;
    uint256 constant private _TO_INDEX = 1;
    uint256 constant private _AMOUNT_INDEX = 2;

    address immutable public protocol;
    IERC20 immutable public token0;
    IERC20 immutable public token1;
    uint256 immutable public fee;
    uint256 immutable public fee2;

    constructor(
        address _protocol,
        IERC20 _token0,
        IERC20 _token1,
        uint256 _fee,
        string memory name,
        string memory symbol
    )
        EIP712Alien(_protocol, "1inch Limit Order Protocol", "3")
        ERC20(name, symbol)
    {
        protocol = _protocol;
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        fee2 = 2e18 * _fee / (1e18 + _fee);
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
        require(token == token0 || token == token1, "ContractRFQ: not allowed token");

        _mint(to, amount * fee2 / 1e18);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(IERC20 token, uint256 amount) public {
        withdrawFor(token, amount, msg.sender);
    }

    function withdrawFor(IERC20 token, uint256 amount, address to) public {
        require(token == token0 || token == token1, "ContractRFQ: not allowed token");

        _burn(msg.sender, amount);
        token.safeTransfer(to, amount * fee2 / 1e18);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view override returns(bytes4) {
        OrderRFQMixin.OrderRFQ memory order = abi.decode(signature, (OrderRFQMixin.OrderRFQ));

        require(
            (
                (order.makerAsset == token0 && order.takerAsset == token1) ||
                (order.makerAsset == token1 && order.takerAsset == token0)
            ) &&
            order.makingAmount * fee <= order.takingAmount * 1e18 &&
            order.maker == address(this) && // TODO: remove redundant check
            _hash(order) == hash,
            "ContractRFQ: bad price"
        );

        return this.isValidSignature.selector;
    }

    function _hash(OrderRFQMixin.OrderRFQ memory order) internal view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            LIMIT_ORDER_RFQ_TYPEHASH,
            order
        )));
    }
}
