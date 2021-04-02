// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface InteractiveTaker {
    function interact(
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 expectedTakingAmount,
        bytes memory interactiveData
    ) external;
}
