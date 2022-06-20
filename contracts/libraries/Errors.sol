// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

// Common of OrderMixin and OrderRFQMixin
error ZeroTargetIsForbidden();
error PrivateOrder();
error BadSignature();
error SwapWithZeroAmount();

// OrderMixin
error UnknownOrder();
error AccessDenied();
error AlreadyFilled();
error PermitLengthTooLow();
error RemainingAmountIsZero();
error ReentrancyDetected();
error PredicateIsNotTrue();
error OnlyOneAmountShouldBeZero();
error TakingAmountTooHigh();
error MakingAmountTooLow();
error TransferFromMakerToTakerFailed();
error TransferFromTakerToMakerFailed();
error WrongAmount();
error WrongGetter();
error getAmountCallFailed();

// OrderRFQMixin
error OrderExpired();
error MakingAmountExceeded();
error TakingAmountExceeded();
error BothAmountsAreNonZero();
error InvalidatedOrder();
