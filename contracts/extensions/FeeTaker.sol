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
import { AmountGetterWithFee } from "./AmountGetterWithFee.sol";

/// @title Helper contract that adds feature of collecting fee in takerAsset
contract FeeTaker is IPostInteraction, AmountGetterWithFee, Ownable {
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using UniERC20 for IERC20;
    using Math for uint256;
    using MakerTraitsLib for MakerTraits;

    bytes1 private constant _CUSTOM_RECEIVER_FLAG = 0x01;

    /**
     * @dev The caller is not the limit order protocol contract.
     */
    error OnlyLimitOrderProtocol();

    /**
     * @dev The taker is not whitelisted and does not have access token.
     */
    error OnlyWhitelistOrAccessToken();

    /**
     * @dev Eth transfer failed. The target fallback may have reverted.
     */
    error EthTransferFailed();

    /**
      * @dev Fees are specified but FeeTaker is not set as a receiver.
      */
    error InconsistentFee();

    address private immutable _LIMIT_ORDER_PROTOCOL;
    address private immutable _WETH;
    /// @notice Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist
    IERC20 private immutable _ACCESS_TOKEN;

    /// @dev Modifier to check if the caller is the limit order protocol contract.
    modifier onlyLimitOrderProtocol {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert OnlyLimitOrderProtocol();
        _;
    }

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param accessToken Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist.
     * @param weth The WETH address.
     * @param owner The owner of the contract.
     */
    constructor(address limitOrderProtocol, IERC20 accessToken, address weth, address owner) Ownable(owner) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _WETH = weth;
        _ACCESS_TOKEN = accessToken;
    }

    /**
     * @notice Fallback function to receive ETH.
     */
    receive() external payable {}

    /**
     * @notice See {IPostInteraction-postInteraction}.
     */
    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
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
     * @notice Retrieves funds accidentally sent directly to the contract address
     * @param token ERC20 token to retrieve
     * @param amount amount to retrieve
     */
    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 1 byte - flags
     * 20 bytes — integrator fee recipient
     * 20 bytes - protocol fee recipient
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     * bytes - fees structure determined by `_getFeeAmounts` implementation
     * bytes — custom data to call extra postInteraction (optional)
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
    ) internal virtual {
        unchecked {
            bool customReceiver = extraData[0] & _CUSTOM_RECEIVER_FLAG == _CUSTOM_RECEIVER_FLAG;
            address integratorFeeRecipient = address(bytes20(extraData[1:21]));
            address protocolFeeRecipient = address(bytes20(extraData[21:41]));
            extraData = extraData[41:];

            address receiver = order.maker.get();
            if (customReceiver) {
                receiver = address(bytes20(extraData));
                extraData = extraData[20:];
            }

            (uint256 integratorFeeAmount, uint256 protocolFeeAmount, bytes calldata tail) = _getFeeAmounts(order, taker, takingAmount, makingAmount, extraData);

            if (order.receiver.get() == address(this)) {
                if (order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth()) {
                    if (integratorFeeAmount > 0) {
                        _sendEth(integratorFeeRecipient, integratorFeeAmount);
                    }
                    if (protocolFeeAmount > 0) {
                        _sendEth(protocolFeeRecipient, protocolFeeAmount);
                    }
                    _sendEth(receiver, takingAmount - integratorFeeAmount - protocolFeeAmount);
                } else {
                    if (integratorFeeAmount > 0) {
                        IERC20(order.takerAsset.get()).safeTransfer(integratorFeeRecipient, integratorFeeAmount);
                    }
                    if (protocolFeeAmount > 0) {
                        IERC20(order.takerAsset.get()).safeTransfer(protocolFeeRecipient, protocolFeeAmount);
                    }
                    IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - integratorFeeAmount - protocolFeeAmount);
                }
            } else if (integratorFeeAmount + protocolFeeAmount > 0) {
                revert InconsistentFee();
            }

            if (tail.length > 19) {
                IPostInteraction(address(bytes20(tail))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, tail[20:]);
            }
        }
    }

    /**
     * @dev Calculates fee amounts depending on whether the taker is in the whitelist and whether they have an _ACCESS_TOKEN.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 1 bytes - integrator rev share percentage (in 1e2)
     * 2 bytes — resolver fee percentage (in 1e5)
     * bytes — whitelist structure determined by `_isWhitelistedPostInteractionImpl` implementation
     * Override this function if the calculation of integratorFee and protocolFee differs from the existing logic and requires a different parsing of extraData.
     */
    function _getFeeAmounts(IOrderMixin.Order calldata /* order */, address taker, uint256 takingAmount, uint256 /* makingAmount */, bytes calldata extraData) internal virtual returns (uint256 integratorFeeAmount, uint256 protocolFeeAmount, bytes calldata tail) {
        (bool isWhitelisted, uint256 integratorFee, uint256 integratorShare, uint256 resolverFee, bytes calldata parsedTail) = _parseFeeData(extraData, taker, _isWhitelistedPostInteractionImpl);
        tail = parsedTail;
        if (!isWhitelisted && _ACCESS_TOKEN.balanceOf(taker) == 0) revert OnlyWhitelistOrAccessToken();

        uint256 denominator = _BASE_1E5 + integratorFee + resolverFee;
        uint256 integratorFeeTotal = takingAmount.mulDiv(integratorFee, denominator);
        integratorFeeAmount = integratorFeeTotal.mulDiv(integratorShare, _BASE_1E2);
        protocolFeeAmount = takingAmount.mulDiv(resolverFee, denominator) + integratorFeeTotal - integratorFeeAmount;
    }

    /**
     * @dev Parses fee data from `extraData`.
     * Override this function if whitelist structure in postInteraction is different from getters.
     */
    function _isWhitelistedPostInteractionImpl(bytes calldata whitelistData, address taker) internal view virtual returns (bool isWhitelisted, bytes calldata tail) {
        return _isWhitelistedGetterImpl(whitelistData, taker);
    }

    function _sendEth(address target, uint256 amount) private {
        (bool success, ) = target.call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }
    }
}
