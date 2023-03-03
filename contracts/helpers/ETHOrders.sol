// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "../interfaces/IPostInteraction.sol";
import "../OrderLib.sol";

/// @title ETH limit orders contract
contract ETHOrders is IPostInteraction, OnlyWethReceiver {
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using ConstraintsLib for Constraints;
    using ExtensionLib for bytes;
    using AddressLib for Address;

    error AccessDenied();
    error ETHTransferFailed();
    error InvalidOrder();
    error NotEnoughBalance();
    error ExistingOrder();

    uint256 constant private _BALANCE_BIT_SHIFT = 160;

    address private immutable _limitOrderProtocol;
    IWETH private immutable _WETH; // solhint-disable-line var-name-mixedcase
    /// @notice Makers and their uint96 ETH balances in single mapping.
    mapping(bytes32 => uint256) private _ordersMakersBalances;

    event ETHDeposited(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied();

        _;
    }

    constructor(IWETH weth, address limitOrderProtocol) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
        _limitOrderProtocol = limitOrderProtocol;
        _WETH.approve(limitOrderProtocol, type(uint256).max);
    }

    /*
     * @notice Returns batch of eth order balances for batch of orders hashes.
     */
    function ordersBalances(bytes32[] calldata orderHashes) external view returns(uint256[] memory balances) {
        balances = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            balances[i] = _getBalance(orderHashes[i]);
        }
    }

    /*
     * @notice Returns batch of eth order balances for batch of orders hashes.
     */
    function ordersMakers(bytes32[] calldata orderHashes) external view returns(address[] memory makers) {
        makers = new address[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            makers[i] = _getMaker(orderHashes[i]);
        }
    }

    /*
     * @notice Checks if ETH order is valid, makes ETH deposit for an order, saves real maker and wraps ETH into WETH.
     */
    function ethOrderDeposit(IOrderMixin.Order calldata order, bytes calldata extension) external payable returns(bytes32 orderHash) {
        if (!order.constraints.needPostInteractionCall()) revert InvalidOrder();
        order.validateExtension(extension);
        if (order.maker.get() != address(this)) revert AccessDenied();
        if (extension.getReceiver(order) != msg.sender) revert AccessDenied();
        if (order.makingAmount != msg.value) revert InvalidOrder();
        bytes calldata interaction = extension.postInteractionTargetAndData();
        if (interaction.length != 20 || address(bytes20(interaction)) != address(this)) revert InvalidOrder();
        orderHash = IOrderMixin(_limitOrderProtocol).hashOrder(order);
        if (_ordersMakersBalances[orderHash] != 0) revert ExistingOrder();
        _ordersMakersBalances[orderHash] = uint160(msg.sender) | (msg.value << _BALANCE_BIT_SHIFT);
        _WETH.safeDeposit(msg.value);
        emit ETHDeposited(orderHash, msg.value);
    }

    /**
     * @notice Sets _ordersMakersBalances to 0, refunds ETH and does standard order cancellation on Limit Order Protocol.
     */
    function cancelOrder(Constraints orderConstraints, bytes32 orderHash) external {
        if (_getMaker(orderHash) != msg.sender) revert InvalidOrder();
        IOrderMixin(_limitOrderProtocol).cancelOrder(orderConstraints, orderHash);
        uint256 refundETHAmount = _getBalance(orderHash);
        _ordersMakersBalances[orderHash] = uint160(msg.sender);
        _WETH.safeWithdrawTo(refundETHAmount, msg.sender);
        emit ETHOrderCancelled(orderHash, refundETHAmount);
    }

    /**
     * @notice Checks if orderHash signature was signed with real order maker.
     */
    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        if (ECDSA.recoverOrIsValidSignature(_getMaker(orderHash), orderHash, signature)) {
            return IERC1271.isValidSignature.selector;
        } else {
            return 0xffffffff;
        }
    }

    /**
     * @notice Callback method that gets called after all funds transfers.
     * Updates _ordersMakersBalances by makingAmount for order with orderHash.
     * @param orderHash Hash of the order being processed
     * @param makingAmount Actual making amount
     */
    function postInteraction(
        IOrderMixin.Order calldata /*order*/,
        bytes32 orderHash,
        address /*taker*/,
        uint256 makingAmount,
        uint256 /*takingAmount*/,
        uint256 /*remainingMakingAmount*/,
        bytes calldata /*extraData*/
    ) external onlyLimitOrderProtocol {
        uint256 curOrder = _ordersMakersBalances[orderHash];
        uint256 curBalance = curOrder >> _BALANCE_BIT_SHIFT;
        if (curBalance < makingAmount) revert NotEnoughBalance();
        unchecked {
            curBalance -= makingAmount;
        }
        _ordersMakersBalances[orderHash] = (curOrder & type(uint160).max) | (curBalance << _BALANCE_BIT_SHIFT);
    }

    function _getMaker(bytes32 orderHash) private view returns (address) {
        return address(uint160(_ordersMakersBalances[orderHash] & type(uint160).max));
    }


    function _getBalance(bytes32 orderHash) private view returns (uint256) {
        return _ordersMakersBalances[orderHash] >> _BALANCE_BIT_SHIFT;
    }
}
