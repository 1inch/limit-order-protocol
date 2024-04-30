// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "../interfaces/IPreInteraction.sol";
import "./ImmutableOwner.sol";

contract ApprovalPreInteraction is IPreInteraction, ImmutableOwner {
    using AddressLib for Address;

    error UnathorizedMaker();

    address private immutable _MAKER;

    constructor(address _immutableOwner, address _maker) ImmutableOwner(_immutableOwner) {
        _MAKER = _maker;
    }

    /**
     * @notice See {IPreInteraction-preInteraction}.
     */
    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external onlyImmutableOwner {
        if (order.maker.get() != address(this)) revert UnathorizedMaker();
        IERC20(order.makerAsset.get()).approve(msg.sender, makingAmount);
    }

    /**
     * @notice Checks if orderHash signature was signed with real order maker.
     */
    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        if (ECDSA.recoverOrIsValidSignature(_MAKER, orderHash, signature)) {
            return IERC1271.isValidSignature.selector;
        } else {
            return 0xffffffff;
        }
    }
}
