// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { OnlyWethReceiver } from "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";

import { MakerTraits, MakerTraitsLib } from "../../libraries/MakerTraitsLib.sol";
import { OrderLib, IOrderMixin } from "../../OrderLib.sol";
import { NativeOrderImpl } from "../NativeOrderImpl.sol";
import { ZkSyncLib } from "./ZkSyncLib.sol";

contract NativeOrderImplZkSync is NativeOrderImpl {
    using MakerTraitsLib for MakerTraits;
    using OrderLib for IOrderMixin.Order;

    bytes32 private immutable _INPUT_HASH;

    constructor(
        IWETH weth,
        address nativeOrderFactory,
        address limitOrderProtocol,
        IERC20 accessToken,
        uint256 cancellationDelay, // Recommended 60 seconds delay after order expiration for rewardable cancellation
        string memory name,
        string memory version
    )
    NativeOrderImpl(weth, nativeOrderFactory, limitOrderProtocol, accessToken, cancellationDelay, name, version)
    {
        _INPUT_HASH = keccak256(abi.encode(address(this)));
    }

    function _calcCloneAddress(IOrderMixin.Order calldata makerOrder) internal override view returns(address) {
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        bytes32 bytecodeHash;
        assembly ("memory-safe") {
            bytecodeHash := extcodehash(address())
        }
        // return _IMPLEMENTATION.predictDeterministicAddress(makerOrderHash, _FACTORY);
        return ZkSyncLib.computeAddressZkSync(makerOrderHash, bytecodeHash, _FACTORY, _INPUT_HASH);
    }
}
