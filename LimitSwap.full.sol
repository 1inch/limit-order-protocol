
// File: @openzeppelin/contracts/math/Math.sol

pragma solidity ^0.5.0;

/**
 * @dev Standard math utilities missing in the Solidity language.
 */
library Math {
    /**
     * @dev Returns the largest of two numbers.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @dev Returns the average of two numbers. The result is rounded towards
     * zero.
     */
    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b) / 2 can overflow, so we distribute
        return (a / 2) + (b / 2) + ((a % 2 + b % 2) / 2);
    }
}

// File: @openzeppelin/contracts/math/SafeMath.sol

pragma solidity ^0.5.0;

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow
 * checks.
 *
 * Arithmetic operations in Solidity wrap on overflow. This can easily result
 * in bugs, because programmers usually assume that an overflow raises an
 * error, which is the standard behavior in high level programming languages.
 * `SafeMath` restores this intuition by reverting the transaction when an
 * operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     *
     * _Available since v2.4.0._
     */
    function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     * - Multiplication cannot overflow.
     */
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts with custom message on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     *
     * _Available since v2.4.0._
     */
    function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, errorMessage);
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mod(a, b, "SafeMath: modulo by zero");
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts with custom message when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     *
     * _Available since v2.4.0._
     */
    function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b != 0, errorMessage);
        return a % b;
    }
}

// File: @openzeppelin/contracts/token/ERC20/IERC20.sol

pragma solidity ^0.5.0;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP. Does not include
 * the optional functions; to access them see {ERC20Detailed}.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// File: @openzeppelin/contracts/utils/Address.sol

pragma solidity ^0.5.5;

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * This test is non-exhaustive, and there may be false-negatives: during the
     * execution of a contract's constructor, its address will be reported as
     * not containing a contract.
     *
     * IMPORTANT: It is unsafe to assume that an address for which this
     * function returns false is an externally-owned account (EOA) and not a
     * contract.
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies in extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        // According to EIP-1052, 0x0 is the value returned for not-yet created accounts
        // and 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470 is returned
        // for accounts without code, i.e. `keccak256('')`
        bytes32 codehash;
        bytes32 accountHash = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;
        // solhint-disable-next-line no-inline-assembly
        assembly { codehash := extcodehash(account) }
        return (codehash != 0x0 && codehash != accountHash);
    }

    /**
     * @dev Converts an `address` into `address payable`. Note that this is
     * simply a type cast: the actual underlying value is not changed.
     *
     * _Available since v2.4.0._
     */
    function toPayable(address account) internal pure returns (address payable) {
        return address(uint160(account));
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.5.11/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     *
     * _Available since v2.4.0._
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        // solhint-disable-next-line avoid-call-value
        (bool success, ) = recipient.call.value(amount)("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }
}

// File: @openzeppelin/contracts/token/ERC20/SafeERC20.sol

pragma solidity ^0.5.0;




/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for ERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using SafeMath for uint256;
    using Address for address;

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        // solhint-disable-next-line max-line-length
        require((value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 newAllowance = token.allowance(address(this), spender).add(value);
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 newAllowance = token.allowance(address(this), spender).sub(value, "SafeERC20: decreased allowance below zero");
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves.

        // A Solidity high level call has three parts:
        //  1. The target address is checked to verify it contains contract code
        //  2. The call itself is made, and success asserted
        //  3. The return value is decoded, which in turn checks the size of the returned data.
        // solhint-disable-next-line max-line-length
        require(address(token).isContract(), "SafeERC20: call to non-contract");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");

        if (returndata.length > 0) { // Return data is optional
            // solhint-disable-next-line max-line-length
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

// File: contracts/LimitSwap.sol

pragma solidity ^0.5.0;






interface InteractiveTaker {
    function interact(
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 takingAmount,
        uint256 expectedAmount
    ) external;
}


library LimitOrder {
    struct Data {
        address makerAddress;
        address takerAddress;
        IERC20 makerAsset;
        IERC20 takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 expiration;
    }

    function hash(Data memory order) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            order.expiration
        ));
    }
}


contract Depositor {

    using SafeMath for uint256;

    mapping(address => uint256) private _balances;

    modifier deposit(bytes4 sig) {
        if (msg.value > 0 && sig == msg.sig) {
            _deposit();
        }
        _;
    }

    modifier depositAndWithdraw(bytes4 sig) {
        uint256 prevBalance = balanceOf(msg.sender);
        if (msg.value > 0 && sig == msg.sig) {
            _deposit();
        }
        _;
        if (balanceOf(msg.sender) > prevBalance) {
            _withdraw(balanceOf(msg.sender).sub(prevBalance));
        }
    }

    function balanceOf(address user) public view returns(uint256) {
        return _balances[user];
    }

    function _deposit() internal {
        _mint(msg.sender, msg.value);
    }

    function _withdraw(uint256 amount) internal {
        _burn(msg.sender, amount);
        msg.sender.transfer(amount);
    }

    function _mint(address user, uint256 amount) internal {
        _balances[user] = _balances[user].add(amount);
    }

    function _burn(address user, uint256 amount) internal {
        _balances[user] = _balances[user].sub(amount);
    }
}


contract LimitSwap is Depositor {

    using SafeERC20 for IERC20;
    using LimitOrder for LimitOrder.Data;

    mapping(bytes32 => uint256) public remainings;

    event LimitOrderUpdated(
        address indexed makerAddress,
        address takerAddress,
        IERC20 indexed makerAsset,
        IERC20 indexed takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 remaining
    );

    function available(
        address makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    )
        public
        view
        returns(uint256)
    {
        if (expiration < now) {
            return 0;
        }

        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: makerAddress,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        if (makerAsset == IERC20(0)) {
            return remainings[order.hash()];
        } else {
            return Math.min(
                remainings[order.hash()],
                Math.min(
                    makerAsset.balanceOf(makerAddress),
                    makerAsset.allowance(makerAddress, address(this))
                )
            );
        }
    }

    function makeOrder(
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    )
        public
        payable
        deposit(this.makeOrder.selector)
    {
        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: msg.sender,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        require(remainings[orderHash] == 0, "LimitSwap: existing order");

        if (makerAsset == IERC20(0)) {
            require(makerAmount == msg.value, "LimitSwap: for ETH makerAmount should be equal to msg.value");
        } else {
            require(msg.value == 0, "LimitSwap: msg.value should be 0 when makerAsset in not ETH");
        }

        remainings[orderHash] = makerAmount;
        _updateOrder(order, orderHash);
    }

    function cancelOrder(
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration
    )
        public
    {
        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: msg.sender,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        require(remainings[orderHash] != 0, "LimitSwap: not existing or already filled order");

        if (makerAsset == IERC20(0)) {
            _withdraw(remainings[orderHash]);
        }

        remainings[orderHash] = 0;
        _updateOrder(order, orderHash);
    }

    function takeOrdersAvailable(
        address payable[] memory makerAddresses,
        address[] memory takerAddresses,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256[] memory makerAmounts,
        uint256[] memory takerAmounts,
        uint256[] memory expirations,
        uint256 takingAmount
    )
        public
        payable
        depositAndWithdraw(this.takeOrdersAvailable.selector)
        returns(uint256 takerVolume)
    {
        for (uint i = 0; takingAmount > takerVolume && i < makerAddresses.length; i++) {
            takerVolume = takerVolume.sub(
                takeOrderAvailable(
                    makerAddresses[i],
                    takerAddresses[i],
                    makerAsset,
                    takerAsset,
                    makerAmounts[i],
                    takerAmounts[i],
                    expirations[i],
                    takingAmount.sub(takerVolume),
                    false
                )
            );
        }
    }

    function takeOrderAvailable(
        address payable makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 takingAmount,
        bool interactive
    )
        public
        payable
        depositAndWithdraw(this.takeOrderAvailable.selector)
        returns(uint256 takerVolume)
    {
        takerVolume = Math.min(
            takingAmount,
            available(
                makerAddress,
                takerAddress,
                makerAsset,
                takerAsset,
                makerAmount,
                takerAmount,
                expiration
            )
        );
        takeOrder(
            makerAddress,
            takerAddress,
            makerAsset,
            takerAsset,
            makerAmount,
            takerAmount,
            expiration,
            takerVolume,
            interactive
        );
    }

    function takeOrder(
        address payable makerAddress,
        address takerAddress,
        IERC20 makerAsset,
        IERC20 takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 expiration,
        uint256 takingAmount,
        bool interactive
    )
        public
        payable
        depositAndWithdraw(this.takeOrder.selector)
    {
        require(block.timestamp <= expiration, "LimitSwap: order already expired");
        require(takerAddress == address(0) || takerAddress == msg.sender, "LimitSwap: access denied to this order");

        LimitOrder.Data memory order = LimitOrder.Data({
            makerAddress: makerAddress,
            takerAddress: takerAddress,
            makerAsset: makerAsset,
            takerAsset: takerAsset,
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: expiration
        });

        bytes32 orderHash = order.hash();
        remainings[orderHash] = remainings[orderHash].sub(takingAmount, "LimitSwap: remaining amount is less than taking amount");
        _updateOrder(order, orderHash);

        // Maker => Taker
        if (makerAsset == IERC20(0)) {
            _burn(makerAddress, takingAmount);
            msg.sender.transfer(takingAmount);
        } else {
            makerAsset.safeTransferFrom(makerAddress, msg.sender, takingAmount);
        }

        // Taker can handle funds interactively
        uint256 expectedAmount = takingAmount.mul(makerAmount).div(takerAmount);
        if (interactive) {
            InteractiveTaker(msg.sender).interact(makerAsset, takerAsset, takingAmount, expectedAmount);
        }

        // Taker => Maker
        if (takerAsset == IERC20(0)) {
            _burn(msg.sender, expectedAmount);
            makerAddress.transfer(expectedAmount);
        } else {
            require(msg.value == 0, "LimitSwap: msg.value should be 0 when takerAsset in not ETH");
            takerAsset.safeTransferFrom(msg.sender, makerAddress, expectedAmount);
        }
    }

    function _updateOrder(
        LimitOrder.Data memory order,
        bytes32 orderHash
    )
        internal
    {
        emit LimitOrderUpdated(
            order.makerAddress,
            order.takerAddress,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            order.expiration,
            remainings[orderHash]
        );
    }
}
