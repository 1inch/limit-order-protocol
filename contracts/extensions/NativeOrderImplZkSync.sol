// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { NativeOrderImpl } from "./NativeOrderImpl.sol";
import { IOrderMixin, OrderLib } from "../OrderLib.sol";
import { ZkSyncLib } from "../libraries/ZkSyncLib.sol";
import { NativeOrderFactoryZkSync } from "./NativeOrderFactoryZkSync.sol";

contract NativeOrderImplZkSync is NativeOrderImpl {
    using OrderLib for IOrderMixin.Order;

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
    {}

    function _calcCloneAddress(IOrderMixin.Order calldata makerOrder) internal override view returns(address) {
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        (bytes32 proxyBytecodeHash, bytes32 nativeOrderImplHash) = NativeOrderFactoryZkSync(_FACTORY).getHashes();
        return ZkSyncLib.computeAddressZkSync(
            makerOrderHash, 
            proxyBytecodeHash, 
            address(_FACTORY), 
            nativeOrderImplHash
        );
    }
}
