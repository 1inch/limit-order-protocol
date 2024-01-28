// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/// @title A helper contract for executing boolean functions on arbitrary target call results
contract PriorityFeeLimiter {
    /// @notice Validates priority fee according to the spec
    /// https://snapshot.org/#/1inch.eth/proposal/0xa040c60050147a0f67042ae024673e92e813b5d2c0f748abf70ddfa1ed107cbe
    /// For blocks with baseFee <10.6 gwei – the priorityFee is capped at 70% of the baseFee.
    /// For blocks with baseFee between 10.6 gwei and 104.1 gwei – the priorityFee is capped at 50% of the baseFee.
    /// For blocks with baseFee >104.1 gwei – priorityFee is capped at 65% of the block’s baseFee.
    function isPriorityFeeValid() public view returns(bool) {
        unchecked {
            uint256 baseFee = block.basefee;
            uint256 priorityFee = tx.gasprice - baseFee;

            if (baseFee < 10.6 gwei) {
                return priorityFee * 100 <= baseFee * 70;
            } else if (baseFee < 104.1 gwei) {
                return priorityFee * 2 <= baseFee;
            } else {
                return priorityFee * 100 <= baseFee * 65;
            }
        }
    }
}
