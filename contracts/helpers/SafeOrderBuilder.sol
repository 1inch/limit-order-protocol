// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { GnosisSafeStorage } from "@gnosis.pm/safe-contracts/contracts/examples/libraries/GnosisSafeStorage.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";

/**
 * @title SafeOrderBuilder
 * @dev The contract is responsible for building and signing limit orders for the GnosisSafe.
 * The contract uses oracles to adjust the order taking amount based on the volatility of the maker and taker assets.
 */
contract SafeOrderBuilder is GnosisSafeStorage {
    error StaleOraclePrice();

    bytes32 private constant _SAFE_MSG_TYPEHASH = keccak256("SafeMessage(bytes message)");

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;
    IOrderRegistrator private immutable _ORDER_REGISTRATOR;

    constructor(IOrderMixin limitOrderProtocol, IOrderRegistrator orderRegistrator) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ORDER_REGISTRATOR = orderRegistrator;
    }

    struct OracleQueryParams {
        AggregatorV3Interface oracle;
        uint256 originalAnswer;
        uint256 ttl;
    }

    /**
     * @notice Builds and signs a limit order for the GnosisSafe.
     * The order is signed by the GnosisSafe and registered in the order registrator.
     * The order taking amount is adjusted based on the volatility of the maker and taker assets.
     * @param order The order to be built and signed.
     * @param extension The extension data associated with the order.
     * @param makerAssetOracleParams The oracle query parameters for the maker asset.
     * @param takerAssetOracleParams The oracle query parameters for the taker asset.
     */
    function buildAndSignOrder(
        IOrderMixin.Order memory order,
        bytes calldata extension,
        OracleQueryParams calldata makerAssetOracleParams,
        OracleQueryParams calldata takerAssetOracleParams
    ) external {
        {
            // account for makerAsset volatility
            (, int256 latestAnswer,, uint256 updatedAt,) = makerAssetOracleParams.oracle.latestRoundData();
            // solhint-disable-next-line not-rely-on-time
            if (updatedAt + makerAssetOracleParams.ttl < block.timestamp) revert StaleOraclePrice();
            order.takingAmount = Math.mulDiv(order.takingAmount, uint256(latestAnswer), makerAssetOracleParams.originalAnswer);
        }

        {
            // account for takerAsset volatility
            (, int256 latestAnswer,, uint256 updatedAt,) = takerAssetOracleParams.oracle.latestRoundData();
            // solhint-disable-next-line not-rely-on-time
            if (updatedAt + takerAssetOracleParams.ttl < block.timestamp) revert StaleOraclePrice();
            order.takingAmount = Math.mulDiv(order.takingAmount, takerAssetOracleParams.originalAnswer, uint256(latestAnswer));
        }

        bytes32 msgHash = _getMessageHash(abi.encode(_LIMIT_ORDER_PROTOCOL.hashOrder(order)));
        signedMessages[msgHash] = 1;

        _ORDER_REGISTRATOR.registerOrder(order, extension, "");
    }


    /**
     * @dev Returns hash of a message that can be signed by owners.
     * @param message Message that should be hashed.
     * @return bytes32 hash of the message.
     */
    function _getMessageHash(bytes memory message) private view returns (bytes32) {
        bytes32 safeMessageHash = keccak256(abi.encode(_SAFE_MSG_TYPEHASH, keccak256(message)));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), GnosisSafe(payable(address(this))).domainSeparator(), safeMessageHash));
    }
}
