// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPreInteraction.sol";
import "../OrderLib.sol";


contract HashChecker is IPreInteraction, Ownable {
    using OrderLib for OrderLib.Order;

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

    function preInteraction(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakerAmount,
        bytes calldata nextInteractiveData
    ) external override {
        if (hashes[orderHash] == false) revert IncorrectOrderHash();

        if (nextInteractiveData.length != 0) {
            IPreInteraction(address(bytes20(nextInteractiveData))).preInteraction(
                orderHash, maker, taker, makingAmount, takingAmount, remainingMakerAmount, nextInteractiveData[20:]
            );
        }
    }
}
