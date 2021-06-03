// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../LimitOrderProtocol.sol";
import "../libraries/ArgumentsDecoder.sol";


contract ContractRFQ is IERC1271 {
    using SafeERC20 for IERC20;
    using ArgumentsDecoder for bytes;

    // EIP 712
    bytes32 immutable private _CACHED_DOMAIN_SEPARATOR;
    uint256 immutable private _CACHED_CHAIN_ID;
    bytes32 immutable private _HASHED_NAME;
    bytes32 immutable private _HASHED_VERSION;
    bytes32 immutable private _TYPE_HASH;

    bytes32 constant public LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ(uint256 info,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData)"
    );

    uint256 constant private _FROM_INDEX = 0;
    uint256 constant private _TO_INDEX = 1;
    uint256 constant private _AMOUNT_INDEX = 2;

    address immutable public protocol;
    IERC20 immutable public token0;
    IERC20 immutable public token1;

    constructor(address _protocol, IERC20 _token0, IERC20 _token1) {
        protocol = _protocol;
        token0 = _token0;
        token1 = _token1;
        _token0.approve(_protocol, type(uint256).max);
        _token1.approve(_protocol, type(uint256).max);

        // EIP 712
        bytes32 hashedName = keccak256(bytes("1inch Limit Order Protocol"));
        bytes32 hashedVersion = keccak256(bytes("1"));
        bytes32 typeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        _HASHED_NAME = hashedName;
        _HASHED_VERSION = hashedVersion;
        _CACHED_CHAIN_ID = block.chainid;
        _CACHED_DOMAIN_SEPARATOR = _buildDomainSeparator(typeHash, hashedName, hashedVersion, _protocol);
        _TYPE_HASH = typeHash;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) public view override returns(bytes4) {
        //LimitOrderProtocol.OrderRFQ memory order = abi.decode(signature, (LimitOrderProtocol.OrderRFQ));
        uint256 info;
        address makerAsset;
        address takerAsset;
        bytes memory makerAssetData;
        bytes memory takerAssetData;
        assembly {
            info := mload(add(signature, 0x40))
            makerAsset := mload(add(signature, 0x60))
            takerAsset := mload(add(signature, 0x80))
            makerAssetData := add(add(signature, 0x40), mload(add(signature, 0xA0)))
            takerAssetData := add(add(signature, 0x40), mload(add(signature, 0xC0)))
        }

        require(
            (
                (makerAsset == address(token0) && takerAsset == address(token1)) ||
                (makerAsset == address(token1) && takerAsset == address(token0))
            ) &&
            makerAssetData.decodeUint256(_AMOUNT_INDEX) * 0.9993e18 <= takerAssetData.decodeUint256(_AMOUNT_INDEX) * 1e18 &&
            takerAssetData.decodeAddress(_TO_INDEX) == address(this) &&
            _hash(info, makerAsset, takerAsset, makerAssetData, takerAssetData) == hash,
            "ContractRFQ: bad price"
        );

        return this.isValidSignature.selector;
    }

    function encoderHelper(LimitOrderProtocol.OrderRFQ memory order) public {
        // ...
    }

    function _hash(
        uint256 info,
        address makerAsset,
        address takerAsset,
        bytes memory makerAssetData,
        bytes memory takerAssetData
    ) internal view returns(bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LIMIT_ORDER_RFQ_TYPEHASH,
                    info,
                    makerAsset,
                    takerAsset,
                    keccak256(makerAssetData),
                    keccak256(takerAssetData)
                )
            )
        );
    }

    // EIP 712

    function _domainSeparatorV4() internal view returns (bytes32) {
        if (block.chainid == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        } else {
            return _buildDomainSeparator(_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, protocol);
        }
    }

    function _buildDomainSeparator(bytes32 typeHash, bytes32 name, bytes32 version, address _protocol) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                typeHash,
                name,
                version,
                block.chainid,
                _protocol // address(this)
            )
        );
    }

    function _hashTypedDataV4(bytes32 structHash) internal view virtual returns (bytes32) {
        return ECDSA.toTypedDataHash(_domainSeparatorV4(), structHash);
    }
}
