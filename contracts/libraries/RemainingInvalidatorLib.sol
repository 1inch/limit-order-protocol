// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

type RemainingInvalidator is uint256;

library RemainingInvalidatorLib {
    function doesNotExist(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) == 0;
    }

    function isPartialFilled(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) > 1;
    }

    function isFullyFilled(RemainingInvalidator invalidator) internal pure returns(bool) {
        return RemainingInvalidator.unwrap(invalidator) == 1;
    }

    function remaining(RemainingInvalidator invalidator) internal pure returns(uint256) {
        unchecked {
            return RemainingInvalidator.unwrap(invalidator) - 1;
        }
    }

    function remains(uint256 remainingMakingAmount, uint256 makingAmount) internal pure returns(RemainingInvalidator) {
        unchecked {
            return RemainingInvalidator.wrap(remainingMakingAmount - makingAmount + 1);
        }
    }

    function invalid() internal pure returns(RemainingInvalidator) {
        return RemainingInvalidator.wrap(1);
    }
}
