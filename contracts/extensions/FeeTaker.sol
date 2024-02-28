// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPostInteraction } from "../interfaces/IPostInteraction.sol";

contract FeeTaker is IPostInteraction {
    using AddressLib for Address;
    using SafeERC20 for IERC20;

    uint256 internal constant _FEE_BASE = 1e7;

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 3 bytes — fee percentage (in 1e7)
     * 20 bytes — fee recipient
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     */
    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external {
        uint256 fee = takingAmount * uint256(uint24(bytes3(extraData))) / _FEE_BASE;
        address feeRecipient = address(bytes20(extraData[3:23]));

        address receiver = order.maker.get();
        if (extraData.length > 23) {
            receiver = address(bytes20(extraData[23:43]));
        }

        if (fee > 0) {
            IERC20(order.takerAsset.get()).safeTransfer(feeRecipient, fee);
        }

        unchecked {
            IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - fee);
        }
    }
}
