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
import { FeeTakerLib } from "../libraries/FeeTakerLib.sol";
import { FeeBank } from "./FeeBank.sol";
import { FeeBankCharger } from "./FeeBankCharger.sol";

/// @title Helper contract that adds feature of collecting fee in takerAsset
contract FeeTaker is IPostInteraction, FeeBankCharger, Ownable {
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using UniERC20 for IERC20;
    using MakerTraitsLib for MakerTraits;
    using FeeTakerLib for bytes;

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
    constructor(address limitOrderProtocol, address weth, IERC20 feeToken, address owner) FeeBankCharger(feeToken, owner) Ownable(owner) {
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

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 2 bytes — Resolver fee percentage (in 1e5). Should be skipped if resolver fee usage flag is not setted.
     * 2 bytes — Integrator fee percentage (in 1e5). Should be skipped if integration fee usage flag is not setted.
     * (bytes10)[N] — Taker whitelist
     * 20 bytes — Fee recipient. Should be skipped if used FeeBank or all fee flags is not setted.
     * 20 bytes — Receiver of taking tokens (optional, if not set, maker is used)
     * 1 byte - Bitmap indicating various usage flags and values.
     *          The bitmask `xxxxxxx1` signifies resolver fee usage.
     *          The bitmask `xxxxxx1x` signifies integration fee usage.
     *          The bitmask `VVVVVxxx` represents the number of takers in the whitelist, where the V bits denote the count of takers.
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
            uint256 integratorFee;
            uint256 resolverFee;
            {
                uint256 resolverFeePercent;
                if (extraData.resolverFeeEnabled()) {
                    resolverFeePercent = uint16(bytes2(extraData));
                    extraData = extraData[2:];
                }
                uint256 integratorFeePercent;
                if (extraData.integratorFeeEnabled()) {
                    integratorFeePercent = uint16(bytes2(extraData));
                    extraData = extraData[2:];
                }
                uint256 denominator = _FEE_BASE + integratorFeePercent + 2 * resolverFeePercent;
                integratorFee = Math.mulDiv(takingAmount, integratorFeePercent, denominator);
                resolverFee = Math.mulDiv(takingAmount, resolverFeePercent, denominator);
            }

            uint256 whitelistEnd = extraData.resolversCount() * 10;
            uint256 maxFee = integratorFee + 2 * resolverFee;
            uint256 fee = maxFee;
            uint256 cashback;
            address feeRecipient;
            if (_isWhitelisted(extraData[:whitelistEnd], taker)) {
                fee -= resolverFee;
                cashback = resolverFee;
            }
            extraData = extraData[whitelistEnd:];
            if (fee > 0) {
                if (FeeBank(FEE_BANK).payWithFeeBank(taker)) {
                    _chargeFee(taker, fee);
                    cashback = maxFee;
                    fee = 0;
                } else {
                    feeRecipient = address(bytes20(extraData));
                    extraData = extraData[20:];
                }
            }

            address receiver = order.maker.get();
            if (extraData.length > 1) {
                receiver = address(bytes20(extraData));
            }

            if (order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth()) {
                if (fee > 0) {
                    _sendEth(feeRecipient, fee);
                }
                if (cashback > 0) {
                    _sendEth(taker, cashback);
                }
                _sendEth(receiver, takingAmount - fee - cashback);
            } else {
                if (fee > 0) {
                    IERC20(order.takerAsset.get()).safeTransfer(feeRecipient, fee);
                }
                if (cashback > 0) {
                    IERC20(order.takerAsset.get()).safeTransfer(taker, cashback);
                }
                IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - fee - cashback);
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
