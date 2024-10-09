// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IAmountGetter } from "../interfaces/IAmountGetter.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IPostInteraction } from "../interfaces/IPostInteraction.sol";
import { PostInteractionController } from "../helpers/PostInteractionController.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";

/// @title Helper contract that adds feature of collecting fee in takerAsset
contract FeeTaker is IPostInteraction, IAmountGetter, PostInteractionController, Ownable {
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
     * @dev Calculate makingAmount with fee.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 1 byte - taker whitelist size
     * (bytes10)[N] — taker whitelist
     */
    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256 calculatedMakingAmount) {
        unchecked {
            (uint256 integratorFee, uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker);
            calculatedMakingAmount = this.getCustomMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail);
            calculatedMakingAmount = Math.mulDiv(calculatedMakingAmount, _FEE_BASE, _FEE_BASE + integratorFee + resolverFee, Math.Rounding.Floor);
            return Math.mulDiv(calculatedMakingAmount, takingAmount, order.takingAmount, Math.Rounding.Floor);
        }
    }

    function getCustomMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata tail
    ) external view virtual returns (uint256) {
        if (tail.length > 20) {
            return IAmountGetter(address(bytes20(tail))).getMakingAmount(
                order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail[20:]
            );
        } else {
            return order.makingAmount;
        }
    }

    /**
     * @dev Calculate takingAmount with fee.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 1 byte - taker whitelist size
     * (bytes10)[N] — taker whitelist
     */
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256 calculatedTakingAmount) {
        unchecked {
            (uint256 integratorFee, uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker);
            calculatedTakingAmount = this.getCustomTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail);
            calculatedTakingAmount = Math.mulDiv(calculatedTakingAmount, _FEE_BASE + integratorFee + resolverFee, _FEE_BASE, Math.Rounding.Ceil);
            return Math.mulDiv(calculatedTakingAmount, makingAmount, order.makingAmount, Math.Rounding.Ceil);
        }
    }

    function getCustomTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata tail
    ) external view virtual returns (uint256) {
        if (tail.length > 20) {
            return IAmountGetter(address(bytes20(tail))).getTakingAmount(
                order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail[20:]
            );
        } else {
            return order.takingAmount;
        }
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata  extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        _postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 1 byte - bitmask ABBBBBBB, where A is the receiver flag and B represents the taker whitelist size
     * (bytes10)[N] — taker whitelist
     * 20 bytes — fee recipient
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     */
    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual override {
        unchecked {
            (uint256 integratorFee, uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker);
            address feeRecipient = address(bytes20(tail));
            tail = tail[20:];
            uint256 denominator = _FEE_BASE + integratorFee + resolverFee;
            // fee is calculated as a sum of separate fees to limit rounding errors
            uint256 fee = Math.mulDiv(takingAmount, integratorFee, denominator) + Math.mulDiv(takingAmount, resolverFee, denominator);

            address receiver = order.maker.get();
            if (uint8(extraData[4]) & 0x80 > 0) { // is set receiver of taking tokens
                receiver = address(bytes20(tail));
                tail = tail[20:];
            }

            if (order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth()) {
                if (fee > 0) {
                    _sendEth(feeRecipient, fee);
                }
                _sendEth(receiver, takingAmount - fee);
            } else {
                if (fee > 0) {
                    IERC20(order.takerAsset.get()).safeTransfer(feeRecipient, fee);
                }
                IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - fee);
            }
            super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, tail);
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

    /**
     * @dev Validates whether the resolver is whitelisted.
     * @param whitelist Whitelist is tightly packed struct of the following format:
     * ```
     * (bytes10)[N] resolversAddresses;
     * ```
     * Only 10 lowest bytes of the resolver address are used for comparison.
     * @param resolver The resolver to check.
     * @return Whether the resolver is whitelisted.
     */
    function _isWhitelisted(bytes calldata whitelist, address resolver) private pure returns (bool) {
        unchecked {
            uint80 maskedResolverAddress = uint80(uint160(resolver));
            uint256 size = whitelist.length / 10;
            for (uint256 i = 0; i < size; i++) {
                uint80 whitelistedAddress = uint80(bytes10(whitelist[:10]));
                if (maskedResolverAddress == whitelistedAddress) {
                    return true;
                }
                whitelist = whitelist[10:];
            }
            return false;
        }
    }

    function _parseFeeData(bytes calldata extraData, address taker) internal virtual view returns (uint256 integratorFee, uint256 resolverFee, bytes calldata tail) {
        unchecked {
            integratorFee = uint256(uint16(bytes2(extraData)));
            resolverFee = uint256(uint16(bytes2(extraData[2:])));
            uint256 whitelistEnd = 5 + 10 * uint256(uint8(extraData[4] & 0x7F)); // & 0x7F - remove receiver of taking tokens flag
            bytes calldata whitelist = extraData[5:whitelistEnd];
            if (!_isWhitelisted(whitelist, taker)) {
                resolverFee *= 2;
            }
            tail = extraData[whitelistEnd:];
        }
    }
}
