/**
 * IPFS CID utilities for Blue Railroad
 * Converts IPFS CIDs to bytes32 hashes for on-chain storage
 */

// Base58 alphabet for CIDv0 decoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Base32 alphabet for CIDv1 decoding (RFC 4648, lowercase)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function base58Decode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = BASE58_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base58 character: ${char}`);

        let carry = index;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }

    // Handle leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
        bytes.push(0);
    }

    return new Uint8Array(bytes.reverse());
}

export function base32Decode(str) {
    // Remove padding if present
    str = str.replace(/=+$/, '').toLowerCase();

    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base32 character: ${char}`);

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return new Uint8Array(output);
}

// Read a varint from bytes at given offset, return [value, bytesRead]
export function readVarint(bytes, offset) {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < bytes.length) {
        const byte = bytes[offset + bytesRead];
        value |= (byte & 0x7f) << shift;
        bytesRead++;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }

    return [value, bytesRead];
}

// Zero hash constant for validation
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Convert IPFS CID to bytes32 hash
 * Supports both CIDv0 (Qm...) and CIDv1 (bafy...)
 * @param {string|null} cid - The CID to convert
 * @returns {string} bytes32 hex string (0x...)
 */
export function cidToBytes32(cid) {
    if (!cid) return ZERO_HASH;

    // If it's already a hex string (0x...), validate and return
    if (cid.startsWith('0x')) {
        if (cid.length === 66) return cid;
        throw new Error('Invalid bytes32 hex string');
    }

    let hashBytes;

    // CIDv0 starts with Qm (base58btc encoded)
    if (cid.startsWith('Qm')) {
        const decoded = base58Decode(cid);

        // CIDv0 structure: 0x12 (sha256) + 0x20 (32 bytes) + 32 bytes hash
        if (decoded.length !== 34) {
            throw new Error(`Invalid CIDv0 length: expected 34 bytes, got ${decoded.length}`);
        }
        if (decoded[0] !== 0x12 || decoded[1] !== 0x20) {
            throw new Error('Invalid CIDv0 prefix: expected sha256 multihash');
        }

        hashBytes = decoded.slice(2);
    }
    // CIDv1 starts with 'b' (base32lower) - common format is bafy... or bafybei...
    else if (cid.startsWith('b')) {
        // Remove the 'b' multibase prefix and decode base32
        const decoded = base32Decode(cid.slice(1));

        let offset = 0;

        // Read CID version (should be 1)
        const [version, versionBytes] = readVarint(decoded, offset);
        offset += versionBytes;
        if (version !== 1) {
            throw new Error(`Unexpected CID version: ${version}`);
        }

        // Read codec (0x70 = dag-pb, 0x55 = raw, 0x71 = dag-cbor)
        const [codec, codecBytes] = readVarint(decoded, offset);
        offset += codecBytes;
        // We don't need the codec value, just skip it

        // Read multihash: hash function code
        const [hashFn, hashFnBytes] = readVarint(decoded, offset);
        offset += hashFnBytes;
        if (hashFn !== 0x12) {
            throw new Error(`Unsupported hash function: 0x${hashFn.toString(16)} (expected sha256 0x12)`);
        }

        // Read multihash: digest length
        const [digestLen, digestLenBytes] = readVarint(decoded, offset);
        offset += digestLenBytes;
        if (digestLen !== 32) {
            throw new Error(`Unexpected digest length: ${digestLen} (expected 32)`);
        }

        // Extract the 32-byte hash
        hashBytes = decoded.slice(offset, offset + 32);
        if (hashBytes.length !== 32) {
            throw new Error(`Could not extract 32-byte hash from CIDv1`);
        }
    }
    else {
        throw new Error('Unsupported CID format. Expected CIDv0 (Qm...) or CIDv1 (b...)');
    }

    return '0x' + Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a CID will produce a usable hash for minting
 * @param {string|null} cid - The CID to validate
 * @returns {{valid: boolean, error?: string, hash?: string}}
 */
export function validateCidForMinting(cid) {
    if (!cid) {
        return { valid: false, error: 'Video must be pinned to IPFS before minting' };
    }

    try {
        const hash = cidToBytes32(cid);
        if (hash === ZERO_HASH) {
            return { valid: false, error: 'Invalid CID - cannot mint with zero hash' };
        }
        return { valid: true, hash };
    } catch (err) {
        return { valid: false, error: `Invalid CID: ${err.message}` };
    }
}

// Base32 encoding for CID reconstruction
function base32Encode(bytes) {
    let result = '';
    let bits = 0;
    let value = 0;

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;

        while (bits >= 5) {
            result += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
            bits -= 5;
        }
    }

    // Handle remaining bits
    if (bits > 0) {
        result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }

    return result;
}

// Write a varint to bytes array
function writeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }
    bytes.push(value);
    return bytes;
}

/**
 * Convert bytes32 hash back to IPFS CID
 * Reconstructs a CIDv1 with dag-pb codec (the format used by Pinata for video files)
 * @param {string} bytes32Hex - The bytes32 hex string (0x...)
 * @returns {string|null} The CID string (bafybei...) or null if invalid
 */
export function bytes32ToCid(bytes32Hex) {
    if (!bytes32Hex || bytes32Hex === ZERO_HASH) return null;

    // Remove 0x prefix and validate
    const hex = bytes32Hex.startsWith('0x') ? bytes32Hex.slice(2) : bytes32Hex;
    if (hex.length !== 64) return null;

    // Convert hex to bytes
    const hashBytes = [];
    for (let i = 0; i < 64; i += 2) {
        hashBytes.push(parseInt(hex.slice(i, i + 2), 16));
    }

    // Build CIDv1 structure:
    // - Version: 1 (varint)
    // - Codec: 0x70 (dag-pb, varint)
    // - Multihash: 0x12 (sha256) + 0x20 (32 bytes) + hash
    const cidBytes = [
        ...writeVarint(1),      // CID version 1
        ...writeVarint(0x70),   // dag-pb codec
        0x12,                   // sha256 hash function
        0x20,                   // 32 byte digest length
        ...hashBytes            // the actual hash
    ];

    // Encode as base32 with 'b' multibase prefix
    return 'b' + base32Encode(new Uint8Array(cidBytes));
}
