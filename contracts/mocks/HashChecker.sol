// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPreInteraction.sol";
import "../OrderLib.sol";


contract HashChecker is IPreInteraction, Ownable {
    using OrderLib for IOrderMixin.Order;

    error IncorrectOrderHash();

    bytes32 public immutable limitOrderProtocolDomainSeparator;
    mapping(bytes32 => bool) public hashes;

    constructor (address limitOrderProtocol) {
        // solhint-disable-next-line avoid-low-level-calls
        (, bytes memory data) = limitOrderProtocol.call(abi.encodeWithSignature("DOMAIN_SEPARATOR()"));
        limitOrderProtocolDomainSeparator = abi.decode(data, (bytes32));
    }

    function setHashOrderStatus(IOrderMixin.Order calldata order, bool status) external onlyOwner {
        bytes32 orderHash = order.hash(limitOrderProtocolDomainSeparator);
        hashes[orderHash] = status;
    }

    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external override {
        if (hashes[orderHash] == false) revert IncorrectOrderHash();

        if (extraData.length != 0) {
            IPreInteraction(address(bytes20(extraData))).preInteraction(
                order,
                orderHash,
                taker,
                makingAmount,
                takingAmount,
                remainingMakingAmount,
                extraData[20:]
            );
        }
    }
}
