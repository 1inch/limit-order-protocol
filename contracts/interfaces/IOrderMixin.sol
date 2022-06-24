// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../OrderLib.sol";

interface IOrderMixin {
    function remaining(bytes32 orderHash) external view returns(uint256);
    function remainingRaw(bytes32 orderHash) external view returns(uint256);
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory);
    function checkPredicate(OrderLib.Order calldata order) external view returns(bool);
    function hashOrder(OrderLib.Order calldata order) external view returns(bytes32);

    function simulate(address target, bytes calldata data) external;

    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash);

    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash);

    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash);

    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash);
}
