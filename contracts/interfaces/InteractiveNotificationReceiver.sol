// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface InteractiveNotificationReceiver {
    function notifyFillOrder(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external;
}
