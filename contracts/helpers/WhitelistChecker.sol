// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/InteractiveNotificationReceiver.sol";
import "../interfaces/IWhitelistRegistry.sol";
import "../libraries/ArgumentsDecoder.sol";

contract WhitelistChecker is InteractiveNotificationReceiver {
    using ArgumentsDecoder for bytes;

    error TakerIsNotWhitelisted();

    IWhitelistRegistry public immutable whitelistRegistry;

    constructor(IWhitelistRegistry _whitelistRegistry) {
        whitelistRegistry = _whitelistRegistry;
    }

    function notifyFillOrder(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata nextInteractiveData
    ) external override {
        if (whitelistRegistry.status(taker) != 1) revert TakerIsNotWhitelisted();

        if (nextInteractiveData.length != 0) {
            (address interactionTarget, bytes calldata interactionData) = nextInteractiveData.decodeTargetAndData();

            InteractiveNotificationReceiver(interactionTarget).notifyFillOrder(
                taker, makerAsset, takerAsset, makingAmount, takingAmount, interactionData
            );
        }
    }
}
