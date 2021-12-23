// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "@openzeppelin/contracts/utils/Address.sol";

/// @title A helper contract for calculations related to order amounts
contract AmountCalculator {
    using Address for address;

    /// @notice Calculates maker amount
    /// @return Result Floored maker amount
    function getMakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) public pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    /// @notice Calculates taker amount
    /// @return Result Ceiled taker amount
    function getTakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) public pure returns(uint256) {
        return (swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
    }

    /// @notice Performs an arbitrary call to target with data
    /// @return Result Bytes transmuted to uint256
    function arbitraryStaticCall(address target, bytes memory data) external view returns(uint256) {
        (bytes memory result) = target.functionStaticCall(data, "AC: arbitraryStaticCall");
        return abi.decode(result, (uint256));
    }
}
