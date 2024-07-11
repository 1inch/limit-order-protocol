// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

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
     * @dev Validates whether the resolver is whitelisted.
     * @param whitelist Whitelist is tightly packed struct of the following format:
     * ```
     * (bytes10)[N] resolversAddresses;
     * ```
     * Only 10 lowest bytes of the resolver address are used for comparison.
     * @param resolver The resolver to check.
     * @return Whether the resolver is whitelisted.
     */
    function _isWhitelisted(bytes calldata whitelist, address resolver) internal view virtual returns (bool) {
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

    function getMakingAmount(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external pure returns (uint256) {
        // TODO: Implement this function
        return 0;
    }

    /**
     * @dev Calculate takingAmount with fee.
     * `extraData` consists of:
     * 1 byte - taker whitelist size
     * (bytes10)[N] — taker whitelist
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     */
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        unchecked {
            uint256 integratorFee = uint256(uint16(bytes2(extraData[:2])));
            uint256 resolverFee = uint256(uint16(bytes2(extraData[2:])));
            uint256 calculatedTakingAmount = order.takingAmount;
            if (!_isWhitelisted(extraData[5:5 + 10 * uint256(uint8(extraData[4]))], taker)) {
                uint256 denominator = _FEE_BASE + integratorFee + resolverFee;
                calculatedTakingAmount = Math.mulDiv(calculatedTakingAmount, denominator + resolverFee, denominator);
            }
            return Math.mulDiv(calculatedTakingAmount, makingAmount, order.makingAmount, Math.Rounding.Ceil);
        }
    }

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 20 bytes — fee recipient
     * 1 byte - taker whitelist size
     * (bytes10)[N] — taker whitelist
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     */
    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        unchecked {
            uint256 integratorFeePercent = uint256(uint16(bytes2(extraData)));
            uint256 resolverFeePercent = uint256(uint16(bytes2(extraData[2:])));
            address feeRecipient = address(bytes20(extraData[4:24]));
            uint256 whitelistEnd = 25 + uint8(extraData[24]) * 10;
            bytes calldata whitelist = extraData[25:whitelistEnd];

            if (!_isWhitelisted(whitelist, taker)) {
                resolverFeePercent *= 2;
            }

            uint256 denominator = _FEE_BASE + integratorFeePercent + resolverFeePercent;
            uint256 integratorFee = Math.mulDiv(takingAmount, integratorFeePercent, denominator);
            uint256 resolverFee = Math.mulDiv(takingAmount, resolverFeePercent, denominator);
            uint256 fee = integratorFee + resolverFee;

            address receiver = order.maker.get();
            if (extraData.length > whitelistEnd) {
                receiver = address(bytes20(extraData[whitelistEnd:whitelistEnd + 20]));
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
