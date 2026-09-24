// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

/**
 * @title Token-like mock whose `permit` re-enters the protocol
 * @notice Test-only. Exists to reach `OrderMixin`'s maker-permit reentrancy
 * guard, which no test previously triggered (GAP-013, requirement SEC-002).
 *
 * The maker permit is executed before the invalidator is written, so it is the
 * one mutating external call in a fill that precedes the effects. This mock
 * re-enters once from inside `permit` and fills the same order, which causes
 * the outer fill to observe a non-new invalidator and revert
 * `ReentrancyDetected`.
 *
 * `SafeERC20.tryPermit` dispatches to `IERC20Permit.permit` when the permit
 * payload is 224 bytes, which is the signature implemented below.
 */
contract ReentrantPermitMock {
    address private immutable _LIMIT_ORDER_PROTOCOL;

    bool private _entered;
    bytes private _reentrantCalldata;

    constructor(address limitOrderProtocol) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
    }

    /// @notice Sets the call this mock replays against the protocol from inside `permit`.
    function setReentrantCalldata(bytes calldata data) external {
        _reentrantCalldata = data;
    }

    /// @notice Approves the protocol to spend this mock's balance of `token`.
    function approveProtocol(address token, uint256 amount) external {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", _LIMIT_ORDER_PROTOCOL, amount)
        );
        require(success, "approve failed");
    }

    /// @notice Returns whether the reentrant call has already been attempted.
    function entered() external view returns (bool) {
        return _entered;
    }

    /**
     * @notice ERC-2612 shaped entry point. Ignores every argument and instead
     * re-enters the protocol exactly once.
     */
    function permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external {
        if (_entered) return;
        _entered = true;
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = _LIMIT_ORDER_PROTOCOL.call(_reentrantCalldata);
        // The outcome is deliberately ignored: the point of the mock is the
        // state the inner call leaves behind, not whether it succeeded.
        success;
    }
}
