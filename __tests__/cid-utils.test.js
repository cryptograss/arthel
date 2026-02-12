/**
 * @jest-environment node
 */

import { cidToBytes32, bytes32ToCid, validateCidForMinting, ZERO_HASH, base58Decode, base32Decode } from '../src/sites/cryptograss.live/js/cid-utils.js';

describe('CID Utilities', () => {
    // Known test vectors - these CIDs and their expected hashes are verified
    const TEST_VECTORS = {
        // CIDv0 example (starts with Qm)
        cidV0: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
        // CIDv1 example (starts with bafy) - this is the same content as above, different encoding
        cidV1: 'bafybeibml5uieyxa5tufngvg7fgwbkwvlsuntwbxgtskoqynbt7wlchmfm',
    };

    describe('cidToBytes32', () => {
        test('returns zero hash for null input', () => {
            const result = cidToBytes32(null);
            expect(result).toBe(ZERO_HASH);
        });

        test('returns zero hash for undefined input', () => {
            const result = cidToBytes32(undefined);
            expect(result).toBe(ZERO_HASH);
        });

        test('returns zero hash for empty string', () => {
            const result = cidToBytes32('');
            expect(result).toBe(ZERO_HASH);
        });

        test('passes through valid bytes32 hex strings', () => {
            const validHex = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
            const result = cidToBytes32(validHex);
            expect(result).toBe(validHex);
        });

        test('throws for invalid length bytes32 hex strings', () => {
            expect(() => cidToBytes32('0x1234')).toThrow('Invalid bytes32 hex string');
        });

        test('converts CIDv0 (Qm...) to valid bytes32', () => {
            const result = cidToBytes32(TEST_VECTORS.cidV0);

            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result).not.toBe(ZERO_HASH);
            expect(result.length).toBe(66); // 0x + 64 hex chars
        });

        test('converts CIDv1 (bafy...) to valid bytes32', () => {
            const result = cidToBytes32(TEST_VECTORS.cidV1);

            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result).not.toBe(ZERO_HASH);
            expect(result.length).toBe(66);
        });

        test('throws for unsupported CID format', () => {
            expect(() => cidToBytes32('invalid-cid')).toThrow('Unsupported CID format');
        });

        test('throws for CIDv0 with wrong prefix bytes', () => {
            // A base58 string that doesn't have the sha256 multihash prefix
            expect(() => cidToBytes32('QmInvalidCidThatWillFailDecoding')).toThrow();
        });

        test('produces consistent output for same input', () => {
            const result1 = cidToBytes32(TEST_VECTORS.cidV0);
            const result2 = cidToBytes32(TEST_VECTORS.cidV0);
            expect(result1).toBe(result2);
        });

        test('produces different output for different CIDs', () => {
            const result1 = cidToBytes32(TEST_VECTORS.cidV0);
            const result2 = cidToBytes32(TEST_VECTORS.cidV1);
            // These are different CIDs so they should produce different hashes
            // (unless they happen to be v0/v1 of the same content, which our test vectors are not)
            expect(result1).not.toBe(result2);
        });
    });

    describe('validateCidForMinting', () => {
        test('rejects null CID', () => {
            const result = validateCidForMinting(null);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('pinned to IPFS');
        });

        test('rejects undefined CID', () => {
            const result = validateCidForMinting(undefined);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('pinned to IPFS');
        });

        test('rejects empty string CID', () => {
            const result = validateCidForMinting('');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('pinned to IPFS');
        });

        test('accepts valid CIDv0', () => {
            const result = validateCidForMinting(TEST_VECTORS.cidV0);
            expect(result.valid).toBe(true);
            expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.hash).not.toBe(ZERO_HASH);
        });

        test('accepts valid CIDv1', () => {
            const result = validateCidForMinting(TEST_VECTORS.cidV1);
            expect(result.valid).toBe(true);
            expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.hash).not.toBe(ZERO_HASH);
        });

        test('rejects malformed CID with descriptive error', () => {
            const result = validateCidForMinting('not-a-valid-cid');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid CID');
        });

        test('returns hash in result when valid', () => {
            const result = validateCidForMinting(TEST_VECTORS.cidV0);
            expect(result.valid).toBe(true);
            expect(result.hash).toBeDefined();
            // Verify the hash matches what cidToBytes32 returns
            expect(result.hash).toBe(cidToBytes32(TEST_VECTORS.cidV0));
        });
    });

    describe('base58Decode', () => {
        test('decodes valid base58 string', () => {
            // '1' in base58 is 0x00
            const result = base58Decode('1');
            expect(result).toEqual(new Uint8Array([0]));
        });

        test('throws for invalid base58 character', () => {
            // '0', 'O', 'I', 'l' are not in base58 alphabet
            expect(() => base58Decode('0')).toThrow('Invalid base58 character');
            expect(() => base58Decode('O')).toThrow('Invalid base58 character');
            expect(() => base58Decode('I')).toThrow('Invalid base58 character');
            expect(() => base58Decode('l')).toThrow('Invalid base58 character');
        });

        test('handles leading zeros correctly', () => {
            // Multiple leading '1's should produce multiple leading 0x00 bytes
            const result = base58Decode('111');
            expect(result[0]).toBe(0);
            expect(result[1]).toBe(0);
            expect(result[2]).toBe(0);
        });
    });

    describe('base32Decode', () => {
        test('decodes valid base32 string', () => {
            // 'aa' in base32 (RFC 4648) represents 0b00000_00000 = 0x00 + partial
            const result = base32Decode('mfra');
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles padding removal', () => {
            // Should handle strings with and without padding
            const withPadding = base32Decode('mfra====');
            const withoutPadding = base32Decode('mfra');
            expect(withPadding).toEqual(withoutPadding);
        });

        test('throws for invalid base32 character', () => {
            expect(() => base32Decode('0')).toThrow('Invalid base32 character');
            expect(() => base32Decode('1')).toThrow('Invalid base32 character');
            expect(() => base32Decode('8')).toThrow('Invalid base32 character');
            expect(() => base32Decode('9')).toThrow('Invalid base32 character');
        });
    });

    describe('ZERO_HASH constant', () => {
        test('has correct format', () => {
            expect(ZERO_HASH).toMatch(/^0x0{64}$/);
            expect(ZERO_HASH.length).toBe(66);
        });
    });

    describe('Real-world CID examples', () => {
        // These are actual CIDs from IPFS that should work
        const realCids = [
            'QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o', // IPFS docs example
            'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku', // CIDv1 raw
        ];

        test.each(realCids)('converts real CID %s to valid bytes32', (cid) => {
            const result = cidToBytes32(cid);
            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result).not.toBe(ZERO_HASH);
        });
    });

    describe('bytes32ToCid', () => {
        test('returns null for null input', () => {
            expect(bytes32ToCid(null)).toBe(null);
        });

        test('returns null for zero hash', () => {
            expect(bytes32ToCid(ZERO_HASH)).toBe(null);
        });

        test('returns null for invalid length', () => {
            expect(bytes32ToCid('0x1234')).toBe(null);
        });

        test('converts valid bytes32 to CIDv1 dag-pb format', () => {
            const bytes32 = '0xa4985f43c96d2754fcd823bc3fcfac9b4e033fd6b637d6b1844738bd2f01c565';
            const result = bytes32ToCid(bytes32);

            // Should produce a valid CIDv1 starting with 'b' (base32)
            expect(result).toMatch(/^b[a-z2-7]+$/);
            // Should start with bafybei (CIDv1 + dag-pb)
            expect(result.startsWith('bafybei')).toBe(true);
        });

        test('round-trip: CIDv1 dag-pb -> bytes32 -> CIDv1', () => {
            // Start with a known CIDv1 dag-pb CID
            const originalCid = 'bafybeifetbpuhslne5kpzwbdxq747le3jybt7vvwg7lldbchhc6s6aofmu';

            // Convert to bytes32
            const bytes32 = cidToBytes32(originalCid);
            expect(bytes32).toMatch(/^0x[0-9a-f]{64}$/);

            // Convert back to CID
            const reconstructedCid = bytes32ToCid(bytes32);

            // The reconstructed CID should be the same
            expect(reconstructedCid).toBe(originalCid);
        });

        test('different CIDs produce different reconstructions', () => {
            const cid1 = 'bafybeibml5uieyxa5tufngvg7fgwbkwvlsuntwbxgtskoqynbt7wlchmfm';
            const cid2 = 'bafybeifetbpuhslne5kpzwbdxq747le3jybt7vvwg7lldbchhc6s6aofmu';

            const bytes32_1 = cidToBytes32(cid1);
            const bytes32_2 = cidToBytes32(cid2);

            const reconstructed1 = bytes32ToCid(bytes32_1);
            const reconstructed2 = bytes32ToCid(bytes32_2);

            expect(reconstructed1).not.toBe(reconstructed2);
        });
    });
});
