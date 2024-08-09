// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { FeeBankCharger } from "./FeeBankCharger.sol";

contract FeeBank is Ownable {
    using SafeERC20 for IERC20;
    using UniERC20 for IERC20;

    error ZeroAddress();

    IERC20 private immutable _FEE_TOKEN;
    FeeBankCharger private immutable _CHARGER;

    mapping(address account => uint256 availableCredit) private _accountDeposits;
    mapping(address => bool) public payWithFeeBank;

    constructor(FeeBankCharger charger, IERC20 feeToken, address owner) Ownable(owner) {
        if (address(feeToken) == address(0)) revert ZeroAddress();
        _CHARGER = charger;
        _FEE_TOKEN = feeToken;
    }

    function setPayWithFeeBank(bool value) external {
        payWithFeeBank[msg.sender] = value;
    }

    /**
     * @notice See {IFeeBank-availableCredit}.
     */
    function availableCredit(address account) external view returns (uint256) {
        return _CHARGER.availableCredit(account);
    }

    /**
     * @notice See {IFeeBank-deposit}.
     */
    function deposit(uint256 amount) external returns (uint256) {
        return _depositFor(msg.sender, amount);
    }

    /**
     * @notice See {IFeeBank-depositFor}.
     */
    function depositFor(address account, uint256 amount) external returns (uint256) {
        return _depositFor(account, amount);
    }

    /**
     * @notice See {IFeeBank-depositWithPermit}.
     */
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256) {
        return depositForWithPermit(msg.sender, amount, permit);
    }

    /**
     * @notice See {IFeeBank-depositForWithPermit}.
     */
    function depositForWithPermit(
        address account,
        uint256 amount,
        bytes calldata permit
    ) public returns (uint256) {
        _FEE_TOKEN.safePermit(permit);
        return _depositFor(account, amount);
    }

    /**
     * @notice See {IFeeBank-withdraw}.
     */
    function withdraw(uint256 amount) external returns (uint256) {
        return _withdrawTo(msg.sender, amount);
    }

    /**
     * @notice See {IFeeBank-withdrawTo}.
     */
    function withdrawTo(address account, uint256 amount) external returns (uint256) {
        return _withdrawTo(account, amount);
    }

    /**
     * @notice Admin method returns commissions spent by users.
     * @param accounts Accounts whose commissions are being withdrawn.
     * @return totalAccountFees The total amount of accounts commissions.
     */
    function gatherFees(address[] calldata accounts) external onlyOwner returns (uint256 totalAccountFees) {
        uint256 accountsLength = accounts.length;
        unchecked {
            for (uint256 i = 0; i < accountsLength; ++i) {
                address account = accounts[i];
                uint256 accountDeposit = _accountDeposits[account];
                uint256 availableCredit_ = _CHARGER.availableCredit(account);
                _accountDeposits[account] = availableCredit_;
                totalAccountFees += accountDeposit - availableCredit_;  // overflow is impossible due to checks in FeeBankCharger
            }
        }
        _FEE_TOKEN.safeTransfer(msg.sender, totalAccountFees);
    }

    function _depositFor(address account, uint256 amount) internal returns (uint256 totalAvailableCredit) {
        if (account == address(0)) revert ZeroAddress();
        _FEE_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        unchecked {
            _accountDeposits[account] += amount;  // overflow is impossible due to limited _FEE_TOKEN supply
        }
        totalAvailableCredit = _CHARGER.increaseAvailableCredit(account, amount);
    }

    function _withdrawTo(address account, uint256 amount) internal returns (uint256 totalAvailableCredit) {
        totalAvailableCredit = _CHARGER.decreaseAvailableCredit(msg.sender, amount);
        unchecked {
            _accountDeposits[msg.sender] -= amount;  // underflow is impossible due to checks in FeeBankCharger
        }
        _FEE_TOKEN.safeTransfer(account, amount);
    }

    /**
     * @notice Retrieves funds accidently sent directly to the contract address
     * @param token ERC20 token to retrieve
     * @param amount amount to retrieve
     */
    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }
}
