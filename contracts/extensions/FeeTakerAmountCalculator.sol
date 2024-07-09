// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../libraries/AmountCalculatorLib.sol";
import "../interfaces/IAmountGetter.sol";

contract FeeTakerAmountCalculator is IAmountGetter {
    using Math for uint256;

    /// @dev Allows fees in range [1e-5, 0.65535]
    uint256 internal constant _FEE_BASE = 1e5;

    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external pure returns (uint256) {
        return AmountCalculatorLib.getMakingAmount(order.makingAmount, order.takingAmount, takingAmount);
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
        uint256 calculatedTakingAmount = order.takingAmount;
        uint256 indexThroughWhitelist = 1 + uint256(uint8(extraData[0]))*10;
        if (!_isWhitelisted(extraData[1:indexThroughWhitelist], taker)) {
            uint256 integratorFee = uint256(uint16(bytes2(extraData[indexThroughWhitelist:indexThroughWhitelist+2])));
            uint256 resolverFee = uint256(uint16(bytes2(extraData[indexThroughWhitelist+2:indexThroughWhitelist+4])));
            uint256 userTakingAmount = _FEE_BASE * order.takingAmount / (_FEE_BASE +  integratorFee + resolverFee);

            calculatedTakingAmount += userTakingAmount * resolverFee / _FEE_BASE;
        }
        return (calculatedTakingAmount * makingAmount).ceilDiv(order.makingAmount);
    }
}

