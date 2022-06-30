// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../interfaces/NotificationReceiver.sol";
import "../interfaces/IWhitelistRegistry.sol";
import "../libraries/ArgumentsDecoder.sol";

// TODO: why WL checker is in interaction, but not in predicate?
contract WhitelistChecker is PreInteractionNotificationReceiver {
    using ArgumentsDecoder for bytes;

    error TakerIsNotWhitelisted();

    IWhitelistRegistry public immutable whitelistRegistry;

    constructor(IWhitelistRegistry _whitelistRegistry) {
        whitelistRegistry = _whitelistRegistry;
    }

    function fillOrderPreInteraction(
        bytes32 orderHash,
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakerAmount,
        bytes calldata nextInteractiveData
    ) external override {
        if (whitelistRegistry.status(taker) != 1) revert TakerIsNotWhitelisted();

        if (nextInteractiveData.length != 0) {
            (address interactionTarget, bytes calldata interactionData) = nextInteractiveData.decodeTargetAndCalldata();

            PreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                orderHash, taker, makerAsset, takerAsset, makingAmount, takingAmount, remainingMakerAmount, interactionData
            );
        }
    }
}
