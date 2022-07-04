// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/NotificationReceiver.sol";
import "../libraries/ArgumentsDecoder.sol";
import "../OrderLib.sol";


contract HashChecker is PreInteractionNotificationReceiver, Ownable {
    using OrderLib for OrderLib.Order;
    using ArgumentsDecoder for bytes;

    error IncorrectOrderHash();

    bytes32 public immutable limitOrderProtocolDomainSeparator;
    mapping(bytes32 => bool) public hashes;

    constructor (address limitOrderProtocol) {
        // solhint-disable-next-line avoid-low-level-calls
        (, bytes memory data) = limitOrderProtocol.call(abi.encodeWithSignature("DOMAIN_SEPARATOR()"));
        limitOrderProtocolDomainSeparator = abi.decode(data, (bytes32));
    }

    function setHashOrderStatus(OrderLib.Order calldata order, bool status) external onlyOwner {
        bytes32 orderHash = order.hash(limitOrderProtocolDomainSeparator);
        hashes[orderHash] = status;
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
        if (hashes[orderHash] == false) revert IncorrectOrderHash();

        if (nextInteractiveData.length != 0) {
            (address interactionTarget, bytes calldata interactionData) = nextInteractiveData.decodeTargetAndCalldata();

            PreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                orderHash, taker, makerAsset, takerAsset, makingAmount, takingAmount, remainingMakerAmount, interactionData
            );
        }
    }
}
