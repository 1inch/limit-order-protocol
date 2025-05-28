// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IAmountGetter } from "../interfaces/IAmountGetter.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";

/// @title Base price getter contract that either calls external getter or applies linear formula
contract AmountGetterBase is IAmountGetter {
    using Math for uint256;

    /**
     * @notice See {IAmountGetter-getMakingAmount}.
     */
    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256) {
        return _getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData);
    }

    /**
     * @notice See {IAmountGetter-getTakingAmount}.
     */
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256) {
        return _getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData);
    }

    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view virtual returns (uint256) {
        if (extraData.length >= 20) {
            return IAmountGetter(address(bytes20(extraData))).getMakingAmount(
                order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData[20:]
            );
        } else {
            return order.makingAmount.mulDiv(takingAmount, order.takingAmount);
        }
    }

    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view virtual returns (uint256) {
        if (extraData.length >= 20) {
            return IAmountGetter(address(bytes20(extraData))).getTakingAmount(
                order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData[20:]
            );
        } else {
            return order.takingAmount.mulDiv(makingAmount, order.makingAmount, Math.Rounding.Ceil);
        }
    }
}
