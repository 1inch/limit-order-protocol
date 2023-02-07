// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";

import "./interfaces/IOrderMixin.sol";
import "./libraries/Errors.sol";
import "./OrderLib.sol";

/// @title ETH limit orders contract
contract ETHOrders is EIP712("1inch Limit Order Protocol", "3") {
    using OrderLib for OrderLib.Order;
    using AddressLib for Address;

    error AccessDenied();
    error ETHRefundFailed();
    error NotEnoughBalance();
    error NotEnoughETHSent();
    error SimulationResults(bool success, bytes res);
    error UnknownOrder();

    uint256 private constant _ORDER_DOES_NOT_EXIST = 0;
    uint256 private constant _ORDER_FILLED = 1;
    uint256 private constant _SKIP_PERMIT_FLAG = 1 << 255;
    uint256 private constant _THRESHOLD_MASK = ~_SKIP_PERMIT_FLAG;

    address private immutable _limitOrderProtocol;
    IWETH private immutable _WETH; // solhint-disable-line var-name-mixedcase
    // Tracks ETH balances for orders.
    mapping(bytes32 => uint256) private _orderBalance;

    event ETHDeposited(bytes32 orderHash, uint256 amount);

    constructor(IWETH weth, address limitOrderProtocol) {
        _WETH = weth;
        _limitOrderProtocol = limitOrderProtocol;
    }

    function ethOrderBalance(bytes32 orderHash) external view returns(uint256 /* rawAmount */) {
        return _orderBalance[orderHash];
    }


    function ethOrderBalances(bytes32[] memory orderHashes) external view returns(uint256[] memory /* rawAmounts */) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = _orderBalance[orderHashes[i]];
        }
        return results;
    }

    /**
     * @notice See {IOrderMixin-simulate}.
     */
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }

    function ethOrderDeposit(OrderLib.Order calldata order) external payable returns(bytes32 orderHash) {
        if (order.maker.get() != msg.sender) revert AccessDenied();
        if (order.makingAmount != msg.value) revert NotEnoughETHSent();
        orderHash = hashOrder(order);
        _orderBalance[orderHash] += msg.value;
        _WETH.deposit{ value: msg.value }();
        emit ETHDeposited(orderHash, msg.value);
    }

    /**
     * @notice See {IOrderMixin-cancelOrder}.
     */
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash) {
        if (order.maker.get() != msg.sender) revert AccessDenied();
        (orderRemaining, orderHash) = IOrderMixin(_limitOrderProtocol).cancelOrder(order);
        orderHash = hashOrder(order);
        uint256 refundETHAmount = _orderBalance[orderHash];
        _orderBalance[orderHash] = 0;
        _WETH.withdraw(refundETHAmount);
        (bool success, ) = msg.sender.call{value: refundETHAmount}(""); // solhint-disable-line avoid-low-level-calls
        if (!success) {
            revert ETHRefundFailed();
        }
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 skipPermitAndThresholdAmount
    ) external payable returns(uint256 actualMakingAmount, uint256 /* actualTakingAmount */, bytes32 orderHash) {
        (actualMakingAmount, , orderHash) = IOrderMixin(_limitOrderProtocol).fillOrder(order, signature, interaction, makingAmount, takingAmount, skipPermitAndThresholdAmount);
        if (_orderBalance[orderHash] < actualMakingAmount) {
            revert NotEnoughBalance();
        }
        _orderBalance[orderHash] -= actualMakingAmount;
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 skipPermitAndThresholdAmount,
        address target,
        bytes calldata permit
    ) external payable returns(uint256 actualMakingAmount, uint256 /* actualTakingAmount */, bytes32 orderHash) {
        (actualMakingAmount, , orderHash) = IOrderMixin(_limitOrderProtocol).fillOrderToWithPermit(order, signature, interaction, makingAmount, takingAmount, skipPermitAndThresholdAmount, target, permit);
        if (_orderBalance[orderHash] < actualMakingAmount) {
            revert NotEnoughBalance();
        }
        _orderBalance[orderHash] -= actualMakingAmount;
    }
    /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }
}
