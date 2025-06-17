import { describe, test, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';

// Mock contract for testing the ticket stub claiming logic
class MockTicketStubClaimer {
    constructor() {
        this.ticketStubs = new Map();
        this.usedSecrets = new Set();
        this.showTicketCounts = new Map();
        this.nextTokenId = 50;
        this.owner = 'owner_address';
        this.totalSupplyValue = 50;
        this.baseURI = '';
    }

    // Helper to hash secrets like Solidity keccak256
    hashSecret(secret) {
        return createHash('sha256').update(secret).digest('hex');
    }

    createTicketStubsForShow(showId, secretHashes, caller = 'owner_address') {
        if (caller !== this.owner) {
            throw new Error('Ownable: caller is not the owner');
        }
        
        if (secretHashes.length === 0) {
            throw new Error('Must create at least one ticket stub');
        }
        
        if (this.showTicketCounts.has(showId)) {
            throw new Error('Ticket stubs already exist for this show');
        }

        const createdTokens = [];
        
        for (const secretHash of secretHashes) {
            if (!secretHash) {
                throw new Error('Secret hash cannot be zero');
            }
            
            const tokenId = this.nextTokenId++;
            
            this.ticketStubs.set(tokenId, {
                showId,
                secretHash,
                claimedBy: null,
                claimedAt: 0,
                exists: true
            });
            
            createdTokens.push(tokenId);
        }
        
        this.showTicketCounts.set(showId, secretHashes.length);
        this.totalSupplyValue = this.nextTokenId - 1;
        
        return createdTokens;
    }

    claimTicketStub(tokenId, secret, caller) {
        const stub = this.ticketStubs.get(tokenId);
        
        if (!stub || !stub.exists) {
            throw new Error('Ticket stub does not exist');
        }
        
        if (stub.claimedBy) {
            throw new Error('Ticket stub already claimed');
        }
        
        if (!secret || secret.length === 0) {
            throw new Error('Secret cannot be empty');
        }
        
        const hashedSecret = this.hashSecret(secret);
        
        if (stub.secretHash !== hashedSecret) {
            throw new Error('Invalid secret');
        }
        
        if (this.usedSecrets.has(hashedSecret)) {
            throw new Error('Secret already used');
        }
        
        // Mark as claimed
        stub.claimedBy = caller;
        stub.claimedAt = Date.now(); // Mock block number
        this.usedSecrets.add(hashedSecret);
        
        return true;
    }

    canClaim(tokenId, secret) {
        const stub = this.ticketStubs.get(tokenId);
        
        if (!stub || !stub.exists) return false;
        if (stub.claimedBy) return false;
        if (!secret || secret.length === 0) return false;
        
        const hashedSecret = this.hashSecret(secret);
        if (this.usedSecrets.has(hashedSecret)) return false;
        
        return stub.secretHash === hashedSecret;
    }

    getTicketStub(tokenId) {
        const stub = this.ticketStubs.get(tokenId);
        if (!stub || !stub.exists) {
            throw new Error('Ticket stub does not exist');
        }
        return stub;
    }

    getTicketStubsForShow(showId) {
        const expectedCount = this.showTicketCounts.get(showId);
        if (!expectedCount || expectedCount === 0) {
            throw new Error('No ticket stubs for this show');
        }
        
        const results = [];
        for (const [tokenId, stub] of this.ticketStubs.entries()) {
            if (stub.exists && stub.showId === showId) {
                results.push(tokenId);
            }
        }
        
        return results;
    }

    totalSupply() {
        return this.totalSupplyValue;
    }

    getClaimedCountForShow(showId) {
        let count = 0;
        for (const stub of this.ticketStubs.values()) {
            if (stub.exists && stub.showId === showId && stub.claimedBy) {
                count++;
            }
        }
        return count;
    }

    getTotalCountForShow(showId) {
        return this.showTicketCounts.get(showId) || 0;
    }

    hasTicketStubsForShow(showId) {
        return this.getTotalCountForShow(showId) > 0;
    }

    getRabbitHash(tokenId) {
        const stub = this.getTicketStub(tokenId);
        // Simulate taking first 8 bytes of hash
        return stub.secretHash.substring(0, 16);
    }
}

describe('TicketStubClaimer Contract', () => {
    let contract;
    const showId = 22575700; // Corresponds to "0_7-22575700" from the code
    const secrets = ['secret1', 'secret2', 'secret3'];
    let secretHashes;

    beforeEach(() => {
        contract = new MockTicketStubClaimer();
        secretHashes = secrets.map(secret => contract.hashSecret(secret));
    });

    describe('Contract deployment', () => {
        test('initializes with correct values', () => {
            expect(contract.nextTokenId).toBe(1);
            expect(contract.totalSupply()).toBe(0);
            expect(contract.ticketStubs.size).toBe(0);
            expect(contract.usedSecrets.size).toBe(0);
        });
    });

    describe('Creating ticket stubs', () => {
        test('creates ticket stubs for a show successfully', () => {
            const tokenIds = contract.createTicketStubsForShow(showId, secretHashes);
            
            expect(tokenIds).toEqual([1, 2, 3]);
            expect(contract.totalSupply()).toBe(3);
            expect(contract.getTotalCountForShow(showId)).toBe(3);
            expect(contract.hasTicketStubsForShow(showId)).toBe(true);
        });

        test('fails when non-owner tries to create ticket stubs', () => {
            expect(() => {
                contract.createTicketStubsForShow(showId, secretHashes, 'not_owner');
            }).toThrow('Ownable: caller is not the owner');
        });

        test('fails when creating empty ticket stub array', () => {
            expect(() => {
                contract.createTicketStubsForShow(showId, []);
            }).toThrow('Must create at least one ticket stub');
        });

        test('fails when creating ticket stubs for show that already has them', () => {
            contract.createTicketStubsForShow(showId, secretHashes);
            
            expect(() => {
                contract.createTicketStubsForShow(showId, [contract.hashSecret('newsecret')]);
            }).toThrow('Ticket stubs already exist for this show');
        });

        test('fails when secret hash is empty', () => {
            expect(() => {
                contract.createTicketStubsForShow(showId, ['', secretHashes[1]]);
            }).toThrow('Secret hash cannot be zero');
        });
    });

    describe('Claiming ticket stubs', () => {
        beforeEach(() => {
            contract.createTicketStubsForShow(showId, secretHashes);
        });

        test('claims ticket stub with valid secret', () => {
            const tokenId = 1;
            const claimerAddress = 'claimer_address';
            
            expect(contract.canClaim(tokenId, secrets[0])).toBe(true);
            
            const result = contract.claimTicketStub(tokenId, secrets[0], claimerAddress);
            expect(result).toBe(true);
            
            const stub = contract.getTicketStub(tokenId);
            expect(stub.claimedBy).toBe(claimerAddress);
            expect(stub.claimedAt).toBeGreaterThan(0);
            
            expect(contract.canClaim(tokenId, secrets[0])).toBe(false);
        });

        test('fails when claiming non-existent ticket stub', () => {
            expect(() => {
                contract.claimTicketStub(999, 'anysecret', 'claimer');
            }).toThrow('Ticket stub does not exist');
        });

        test('fails when claiming already claimed ticket stub', () => {
            const tokenId = 1;
            contract.claimTicketStub(tokenId, secrets[0], 'first_claimer');
            
            expect(() => {
                contract.claimTicketStub(tokenId, secrets[0], 'second_claimer');
            }).toThrow('Ticket stub already claimed');
        });

        test('fails when claiming with invalid secret', () => {
            expect(() => {
                contract.claimTicketStub(1, 'wrong_secret', 'claimer');
            }).toThrow('Invalid secret');
        });

        test('fails when claiming with empty secret', () => {
            expect(() => {
                contract.claimTicketStub(1, '', 'claimer');
            }).toThrow('Secret cannot be empty');
        });

        test('fails when secret has already been used', () => {
            // Create two tickets with the same secret hash (which shouldn't happen in practice)
            const duplicateSecret = 'duplicate_secret';
            const duplicateHash = contract.hashSecret(duplicateSecret);
            const newShowId = 99999;
            
            contract.createTicketStubsForShow(newShowId, [duplicateHash, duplicateHash]);
            
            // Claim first ticket with secret
            contract.claimTicketStub(4, duplicateSecret, 'first_claimer'); // tokenId 4 is first in new show
            
            // Try to claim second ticket with same secret
            expect(() => {
                contract.claimTicketStub(5, duplicateSecret, 'second_claimer'); // tokenId 5 is second in new show
            }).toThrow('Secret already used');
        });

        test('tracks claimed count correctly', () => {
            expect(contract.getClaimedCountForShow(showId)).toBe(0);
            
            contract.claimTicketStub(1, secrets[0], 'claimer1');
            expect(contract.getClaimedCountForShow(showId)).toBe(1);
            
            contract.claimTicketStub(2, secrets[1], 'claimer2');
            expect(contract.getClaimedCountForShow(showId)).toBe(2);
        });
    });

    describe('Querying ticket stubs', () => {
        beforeEach(() => {
            contract.createTicketStubsForShow(showId, secretHashes);
        });

        test('retrieves ticket stub data correctly', () => {
            const tokenId = 1;
            const stub = contract.getTicketStub(tokenId);
            
            expect(stub.showId).toBe(showId);
            expect(stub.secretHash).toBe(secretHashes[0]);
            expect(stub.claimedBy).toBe(null);
            expect(stub.exists).toBe(true);
        });

        test('gets all ticket stubs for a show', () => {
            const ticketStubs = contract.getTicketStubsForShow(showId);
            expect(ticketStubs).toEqual([1, 2, 3]);
        });

        test('fails to get ticket stubs for show with no tickets', () => {
            expect(() => {
                contract.getTicketStubsForShow(99999);
            }).toThrow('No ticket stubs for this show');
        });

        test('generates rabbit hash correctly', () => {
            const rabbitHash = contract.getRabbitHash(1);
            expect(typeof rabbitHash).toBe('string');
            expect(rabbitHash.length).toBe(16); // First 8 bytes as hex
            expect(rabbitHash).toBe(secretHashes[0].substring(0, 16));
        });
    });

    describe('Multiple shows integration', () => {
        test('handles multiple shows independently', () => {
            const showId1 = 22575700;
            const showId2 = 22590100;
            const secrets1 = ['show1_secret1', 'show1_secret2'];
            const secrets2 = ['show2_secret1', 'show2_secret2', 'show2_secret3'];
            
            contract.createTicketStubsForShow(showId1, secrets1.map(s => contract.hashSecret(s)));
            contract.createTicketStubsForShow(showId2, secrets2.map(s => contract.hashSecret(s)));
            
            expect(contract.getTotalCountForShow(showId1)).toBe(2);
            expect(contract.getTotalCountForShow(showId2)).toBe(3);
            expect(contract.totalSupply()).toBe(5);
            
            const show1Stubs = contract.getTicketStubsForShow(showId1);
            const show2Stubs = contract.getTicketStubsForShow(showId2);
            
            expect(show1Stubs).toEqual([1, 2]);
            expect(show2Stubs).toEqual([3, 4, 5]);
        });

        test('prevents cross-show secret reuse', () => {
            const showId1 = 22575700;
            const showId2 = 22590100;
            const sharedSecret = 'shared_secret';
            const secretHash = contract.hashSecret(sharedSecret);
            
            // Create tickets for both shows with same secret hash
            contract.createTicketStubsForShow(showId1, [secretHash]);
            contract.createTicketStubsForShow(showId2, [secretHash]);
            
            // Claim from first show
            contract.claimTicketStub(1, sharedSecret, 'claimer1');
            
            // Should fail to claim from second show with same secret
            expect(() => {
                contract.claimTicketStub(2, sharedSecret, 'claimer2');
            }).toThrow('Secret already used');
        });
    });

    describe('Edge cases and security', () => {
        test('handles very long secrets', () => {
            const longSecret = 'a'.repeat(1000);
            const longSecretHash = contract.hashSecret(longSecret);
            
            contract.createTicketStubsForShow(showId, [longSecretHash]);
            
            expect(contract.canClaim(1, longSecret)).toBe(true);
            contract.claimTicketStub(1, longSecret, 'claimer');
            
            const stub = contract.getTicketStub(1);
            expect(stub.claimedBy).toBe('claimer');
        });

        test('handles special characters in secrets', () => {
            const specialSecret = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`';
            const specialSecretHash = contract.hashSecret(specialSecret);
            
            contract.createTicketStubsForShow(showId, [specialSecretHash]);
            
            expect(contract.canClaim(1, specialSecret)).toBe(true);
            contract.claimTicketStub(1, specialSecret, 'claimer');
            
            const stub = contract.getTicketStub(1);
            expect(stub.claimedBy).toBe('claimer');
        });

        test('maintains state consistency across operations', () => {
            contract.createTicketStubsForShow(showId, secretHashes);
            
            // Claim middle token
            contract.claimTicketStub(2, secrets[1], 'claimer');
            
            // Verify state
            expect(contract.getTicketStub(1).claimedBy).toBe(null);
            expect(contract.getTicketStub(2).claimedBy).toBe('claimer');
            expect(contract.getTicketStub(3).claimedBy).toBe(null);
            
            expect(contract.getClaimedCountForShow(showId)).toBe(1);
            expect(contract.getTotalCountForShow(showId)).toBe(3);
        });
    });
});