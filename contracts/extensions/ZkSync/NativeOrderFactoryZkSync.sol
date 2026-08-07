// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IOrderMixin } from "../../interfaces/IOrderMixin.sol";
import { Errors } from "../../libraries/Errors.sol";
import { EIP712Alien } from "../../utils/EIP712Alien.sol";
import { OrderLib } from "../../OrderLib.sol";
import { NativeOrderImplZkSync } from "./NativeOrderImplZkSync.sol";
import { MinimalProxyZkSync } from "./MinimalProxyZkSync.sol";
import { ZkSyncLib } from "./ZkSyncLib.sol";
import { NativeOrderFactoryBase } from "../NativeOrderFactoryBase.sol";

contract NativeOrderFactoryZkSync is NativeOrderFactoryBase {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;

    bytes32 public immutable IMPLEMENTATION_INPUT_HASH;
    bytes32 private immutable _PROXY_IMPL_BYTECODE_HASH;

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
        IMPLEMENTATION = address(new NativeOrderImplZkSync(
            weth,
            address(this),
            limitOrderProtocol,
            accessToken,
            cancellationDelay,
            name,
            version
        ));
        IMPLEMENTATION_INPUT_HASH = keccak256(abi.encode(IMPLEMENTATION));

        MinimalProxyZkSync proxyImpl = new MinimalProxyZkSync(IMPLEMENTATION);
        bytes32 bytecodeHash;
        assembly ("memory-safe") {
            bytecodeHash := extcodehash(proxyImpl)
        }
        _PROXY_IMPL_BYTECODE_HASH = bytecodeHash;
    }

    function addressOfNativeOrder(IOrderMixin.Order calldata makerOrder) external view returns (address) {
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        return ZkSyncLib.computeAddressZkSync(makerOrderHash, _PROXY_IMPL_BYTECODE_HASH, address(this), IMPLEMENTATION_INPUT_HASH);
    }

    function _deployNativeOrder(address implementation, bytes32 salt) internal override virtual returns (address) {
        return address(new MinimalProxyZkSync{salt: salt}(implementation));
    }
}
