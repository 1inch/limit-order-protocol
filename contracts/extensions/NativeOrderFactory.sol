// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { EIP712Alien } from "../mocks/EIP712Alien.sol";
import { OrderLib, IOrderMixin } from "../OrderLib.sol";
import { NativeOrderImpl } from "./NativeOrderImpl.sol";

contract NativeOrderFactory is Ownable, EIP712Alien {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    event NativeOrderCreated(address maker, bytes32 orderHash, address clone, uint256 value);

    error OrderMakerShouldBeMsgSender(address expected, address actual);
    error OrderReceiverShouldNotBeThis(address receiver, address self);
    error OrderMakingAmountShouldBeEqualToMsgValue(uint256 expected, uint256 actual);

    IWETH private immutable _WETH;
    address private immutable _LOP;
    address private immutable _IMPLEMENTATION;
    IERC20 private immutable _ACCESS_TOKEN;

    constructor(
        IWETH weth,
        address nativeOrderImplementation,
        address limitOrderProtocol,
        IERC20 accessToken
    )
        Ownable(msg.sender)
        EIP712Alien(limitOrderProtocol, "1inch Limit Order Protocol", "4")
    {
        _WETH = weth;
        _LOP = limitOrderProtocol;
        _IMPLEMENTATION = nativeOrderImplementation;
        _ACCESS_TOKEN = accessToken;
    }

    function create(IOrderMixin.Order calldata makerOrder) external payable returns (address clone) {
        // Validate main order parameters
        if (makerOrder.maker.get() != msg.sender) revert OrderMakerShouldBeMsgSender(msg.sender, makerOrder.maker.get());
        if (makerOrder.getReceiver() == address(this)) revert OrderReceiverShouldNotBeThis(makerOrder.getReceiver(), address(this));
        if (msg.value != makerOrder.makingAmount) revert OrderMakingAmountShouldBeEqualToMsgValue(makerOrder.makingAmount, msg.value);

        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        clone = _IMPLEMENTATION.cloneDeterministic(makerOrderHash);
        NativeOrderImpl(payable(clone)).depositAndApprove{ value: msg.value }(msg.sender);
        emit NativeOrderCreated(msg.sender, makerOrderHash, clone, msg.value);
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
