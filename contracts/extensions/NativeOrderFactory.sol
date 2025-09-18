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
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    event NativeOrderCreated(address maker, bytes32 orderHash, address clone, uint256 value);

    address public immutable IMPLEMENTATION;

    constructor(
        IWETH weth,
        address limitOrderProtocol,
        IERC20 accessToken,
        uint256 cancellationDelay, // Recommended 60 seconds delay after order expiration for rewardable cancellation
        string memory name,
        string memory version
    )
        Ownable(msg.sender)
        EIP712Alien(limitOrderProtocol, name, version)
    {
        IMPLEMENTATION = address(new NativeOrderImpl(
            weth,
            address(this),
            limitOrderProtocol,
            accessToken,
            cancellationDelay,
            name,
            version
        ));
    }

    function create(bytes32 makerSalt, bytes32 orderHash, uint40 expiration) external payable returns (address clone) {
        bytes32 salt = keccak256(abi.encode(msg.sender, makerSalt));
        clone = IMPLEMENTATION.cloneDeterministic(salt);
        NativeOrderImpl(payable(clone)).deposit{ value: msg.value }(msg.sender, orderHash, expiration);
        emit NativeOrderCreated(msg.sender, orderHash, clone, msg.value);
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
