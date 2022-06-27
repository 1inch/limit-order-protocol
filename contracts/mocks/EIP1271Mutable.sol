// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "../libraries/ECDSA.sol";

contract EIP1271Mutable {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable router;

    constructor(address router_) {
        owner = msg.sender;
        router = router_;
    }

    // function func_10t2f2P(bytes32 hash, bytes calldata signature, address token, uint256 amount) external returns(bytes4) {
    //     if (owner != ECDSA.recover(hash, signature)) {
    //         return 0;
    //     }

    //     if (msg.sender == router) {
    //         IERC20(token).forceApprove(router, amount);
    //     }

    //     return this.func_10t2f2P.selector;
    // }

    function isValidSignature(bytes32 hash, bytes calldata signature) external returns(bytes4) {
        if (owner != ECDSA.recover(hash, signature)) {
            return 0;
        }

        if (msg.sender == router) {
            (address token, uint256 amount) = _extractTokanAndAmountFromCalldataIfPresented();
            if (amount > 0) {
                IERC20(token).forceApprove(router, amount);
            }
        }

        return this.isValidSignature.selector;
    }

    function _extractTokanAndAmountFromCalldataIfPresented() private pure returns(address token, uint256 amount) {
        assembly {  // solhint-disable-line no-inline-assembly
            if eq(calldataload(0x24), 0x80) {
                token := calldataload(0x44)
                amount := calldataload(0x64)
            }
        }
    }
}
