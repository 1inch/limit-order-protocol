// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPostInteraction } from "../interfaces/IPostInteraction.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";

/// @title Helper contract that adds feature of collecting fee in takerAsset
contract FeeTaker is IPostInteraction, Ownable {
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using UniERC20 for IERC20;
    using MakerTraitsLib for MakerTraits;

    /**
     * @dev The caller is not the limit order protocol contract.
     */
    error OnlyLimitOrderProtocol();

    /**
     * @dev Eth transfer failed. The target fallback may have reverted.
     */
    error EthTransferFailed();

    /// @dev Allows fees in range [1e-5, 0.65535]
    uint256 internal constant _FEE_BASE = 1e5;

    address private immutable _LIMIT_ORDER_PROTOCOL;
    address private immutable _WETH;

    /// @dev Modifier to check if the caller is the limit order protocol contract.
    modifier onlyLimitOrderProtocol {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert OnlyLimitOrderProtocol();
        _;
    }

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     */
    constructor(address limitOrderProtocol, address weth, address owner) Ownable(owner) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _WETH = weth;
    }

    /**
     * @notice Fallback function to receive ETH.
     */
    receive() external payable {}

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 2 bytes — fee percentage (in 1e5)
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
    ) external onlyLimitOrderProtocol {
        uint256 fee = takingAmount * uint256(uint16(bytes2(extraData))) / _FEE_BASE;
        address feeRecipient = address(bytes20(extraData[2:22]));

        address receiver = order.maker.get();
        if (extraData.length > 22) {
            receiver = address(bytes20(extraData[22:42]));
        }

        bool isEth = order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth();

        if (isEth) {
            if (fee > 0) {
                _sendEth(feeRecipient, fee);
            }
            unchecked {
                _sendEth(receiver, takingAmount - fee);
            }
        } else {
            if (fee > 0) {
                IERC20(order.takerAsset.get()).safeTransfer(feeRecipient, fee);
            }
            unchecked {
                IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - fee);
            }
        }
    }

    /**
     * @notice Retrieves funds accidently sent directly to the contract address
     * @param token ERC20 token to retrieve
     * @param amount amount to retrieve
     */
    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    function _sendEth(address target, uint256 amount) private {
        (bool success, ) = target.call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }
    }
}
