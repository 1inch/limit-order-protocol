// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { Errors } from "../libraries/Errors.sol";
import { EIP712Alien } from "../utils/EIP712Alien.sol";
import { OrderLib } from "../OrderLib.sol";
import { NativeOrderImpl } from "./NativeOrderImpl.sol";
import { NativeOrderFactoryBase } from "./NativeOrderFactoryBase.sol";

contract NativeOrderFactory is NativeOrderFactoryBase {
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
}
