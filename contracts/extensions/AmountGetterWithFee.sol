// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { AmountGetterBase } from "./AmountGetterBase.sol";

/// @title Price getter contract that adds fee calculation
contract AmountGetterWithFee is AmountGetterBase {
    using Math for uint256;

    /// @dev Allows fees in range [1e-5, 0.65535]
    uint256 internal constant _BASE_1E5 = 1e5;
    uint256 internal constant _BASE_1E2 = 100;

    error InvalidIntegratorShare();
    error InvalidWhitelistDiscountNumerator();

    /**
     * @dev Calculates makingAmount with fee.
     */
    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view virtual override returns (uint256) {
        unchecked {
            (, uint256 integratorFee, , uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker, _isWhitelistedGetterImpl);
            return super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail).mulDiv(
                _BASE_1E5,
                _BASE_1E5 + integratorFee + resolverFee
            );
        }
    }

    /**
     * @dev Calculates takingAmount with fee.
     */
    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view virtual override returns (uint256) {
        unchecked {
            (, uint256 integratorFee, , uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker, _isWhitelistedGetterImpl);
            return super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail).mulDiv(
                _BASE_1E5 + integratorFee + resolverFee,
                _BASE_1E5,
                Math.Rounding.Ceil
            );
        }
    }

    /**
     * @dev `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 1 byte - integrator share percentage (in 1e2)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 1 byte - whitelist discount numerator (in 1e2)
     * bytes — whitelist structure determined by `_isWhitelisted` implementation
     * bytes — custom data (optional)
     * @param _isWhitelisted internal function to parse and check whitelist
     */
    function _parseFeeData(
        bytes calldata extraData,
        address taker,
        function (bytes calldata, address) internal view returns (bool, bytes calldata) _isWhitelisted
    ) internal view returns (bool isWhitelisted, uint256 integratorFee, uint256 integratorShare, uint256 resolverFee, bytes calldata tail) {
        unchecked {
            integratorFee = uint256(uint16(bytes2(extraData)));
            integratorShare = uint256(uint8(extraData[2]));
            if (integratorShare > _BASE_1E2) revert InvalidIntegratorShare();
            resolverFee = uint256(uint16(bytes2(extraData[3:])));
            uint256 whitelistDiscountNumerator = uint256(uint8(extraData[5]));
            if (whitelistDiscountNumerator > _BASE_1E2) revert InvalidWhitelistDiscountNumerator();
            (isWhitelisted, tail) = _isWhitelisted(extraData[6:], taker);
            if (isWhitelisted) {
                resolverFee = resolverFee * whitelistDiscountNumerator / _BASE_1E2;
            }
        }
    }

    /**
     * @dev Validates whether the taker is whitelisted.
     * @param whitelistData Whitelist data is a tightly packed struct of the following format:
     * ```
     * 1 byte - size of the whitelist
     * (bytes10)[N] whitelisted addresses;
     * ```
     * Only 10 lowest bytes of the address are used for comparison.
     * @param taker The taker address to check.
     * @return isWhitelisted Whether the taker is whitelisted.
     * @return tail Remaining calldata.
     */
    function _isWhitelistedGetterImpl(bytes calldata whitelistData, address taker) internal pure returns (bool isWhitelisted, bytes calldata tail) {
        unchecked {
            uint80 maskedTakerAddress = uint80(uint160(taker));
            uint256 size = uint8(whitelistData[0]);
            bytes calldata whitelist = whitelistData[1:1 + 10 * size];
            tail = whitelistData[1 + 10 * size:];
            for (uint256 i = 0; i < size; i++) {
                uint80 whitelistedAddress = uint80(bytes10(whitelist[:10]));
                if (maskedTakerAddress == whitelistedAddress) {
                    return (true, tail);
                }
                whitelist = whitelist[10:];
            }
        }
    }
}
