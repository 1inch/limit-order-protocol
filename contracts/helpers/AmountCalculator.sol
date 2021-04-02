// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/UnsafeAddress.sol";


contract AmountCalculator {
    using UnsafeAddress for address;

    // Floor maker amount
    function getMakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) external pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    // Ceil taker amount
    function getTakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) external pure returns(uint256) {
        return (swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
    }

    function getMakerAmountNoPartialFill(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) external pure returns(uint256) {
        return (swapTakerAmount == orderTakerAmount) ? orderMakerAmount : 0;
    }

    function getTakerAmountNoPartialFill(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) external pure returns(uint256) {
        return (swapMakerAmount == orderMakerAmount) ? orderTakerAmount : 0;
    }

    function arbitraryStaticCall(address target, bytes memory data) external view returns(uint256) {
        (bytes memory result) = target.unsafeFunctionStaticCall(data, "AC: arbitraryStaticCall");
        return abi.decode(result, (uint256));
    }
}
