let currentNonce = 0n;

/**
 * Returns a unique nonce for Permit2 SignatureTransfer.
 * Uses global state to ensure each call returns a different nonce.
 * @returns {bigint} A unique nonce
 */
function nextPermit2Nonce () {
    return currentNonce++;
}

module.exports = {
    nextPermit2Nonce,
};
