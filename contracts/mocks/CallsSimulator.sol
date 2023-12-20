// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/// @title Tool to be used inside `LOP.simulate()` call
contract CallsSimulator {
    error ArraySizeMismatch();

    /**
     * @notice Calls every target with corresponding data. Then reverts with CALL_RESULTS_0101011 where zeroes and ones
     * denote failure or success of the corresponding call
     * @param targets Array of addresses that will be called
     * @param data Array of data that will be passed to each call
     */
    function simulateCalls(address[] calldata targets, bytes[] calldata data) external {
        if (targets.length != data.length) revert ArraySizeMismatch();
        bytes memory reason = new bytes(targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory result) = targets[i].call(data[i]);
            if (success && result.length == 32 && abi.decode(result, (bool))) {
                reason[i] = "1";
            } else {
                reason[i] = "0";
            }
        }

        // Always revert and provide per call results
        revert(string(abi.encodePacked("CALL_RESULTS_", reason)));
    }
}
