// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { NativeOrderFactory } from "./NativeOrderFactory.sol";
import { MinimalProxyZkSync } from "../helpers/MinimalProxyZkSync.sol";

contract NativeOrderFactoryZkSync is NativeOrderFactory {
    bytes32 private immutable _NATIVE_ORDER_IMPL_HASH;
    bytes32 private immutable _PROXY_BYTECODE_HASH;

    constructor(
        IWETH weth,
        address limitOrderProtocol,
        IERC20 accessToken,
        uint256 cancellationDelay,
        string memory name,
        string memory version
    )
        NativeOrderFactory(weth, limitOrderProtocol, accessToken, cancellationDelay, name, version)
    {
        _NATIVE_ORDER_IMPL_HASH = keccak256(abi.encode(IMPLEMENTATION));
        MinimalProxyZkSync proxySrc = new MinimalProxyZkSync(IMPLEMENTATION);
        bytes32 bytecodeHashSrc;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly 
            bytecodeHashSrc := extcodehash(proxySrc)
        }
        _PROXY_BYTECODE_HASH = bytecodeHashSrc;
    }

    function getHashes() external view returns (bytes32, bytes32) {
        return (_PROXY_BYTECODE_HASH, _NATIVE_ORDER_IMPL_HASH);
    }

    function _cloneImplementation(bytes32 makerOrderHash) internal virtual override returns (address) {
        return address(new MinimalProxyZkSync{ salt: makerOrderHash }(IMPLEMENTATION));
    }
}