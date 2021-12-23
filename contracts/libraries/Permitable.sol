// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "./RevertReasonParser.sol";
import "../interfaces/IDaiLikePermit.sol";

/// @title Base contract with common permit handling logics
abstract contract Permitable {
    function _permit(address token, bytes calldata permit) internal {
        if (permit.length > 0) {
            bool success;
            bytes memory result;
            if (permit.length == 32 * 7) {
                // solhint-disable-next-line avoid-low-level-calls
                (success, result) = token.call(abi.encodePacked(IERC20Permit.permit.selector, permit));
            } else if (permit.length == 32 * 8) {
                // solhint-disable-next-line avoid-low-level-calls
                (success, result) = token.call(abi.encodePacked(IDaiLikePermit.permit.selector, permit));
            } else {
                revert("Wrong permit length");
            }
            if (!success) {
                revert(RevertReasonParser.parse(result, "Permit failed: "));
            }
        }
    }

    function _permitMemory(address token, bytes memory permit) internal {
        if (permit.length > 0) {
            bool success;
            bytes memory result;
            if (permit.length == 32 * 7) {
                // solhint-disable-next-line avoid-low-level-calls
                (success, result) = token.call(abi.encodePacked(IERC20Permit.permit.selector, permit));
            } else if (permit.length == 32 * 8) {
                // solhint-disable-next-line avoid-low-level-calls
                (success, result) = token.call(abi.encodePacked(IDaiLikePermit.permit.selector, permit));
            } else {
                revert("Wrong permit length");
            }
            if (!success) {
                revert(RevertReasonParser.parse(result, "Permit failed: "));
            }
        }
    }
}
