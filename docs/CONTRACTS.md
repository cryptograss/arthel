# Cryptograss Smart Contract Registry

This document tracks all smart contracts in the cryptograss ecosystem, their deployment status, and related infrastructure.

## Deployed Contracts

### Set Stones (ERC-721)
- **Address**: `0x39269b3FddFc9bf0626e5CFe4424aa51A77f7678`
- **Chain**: Arbitrum One
- **ABI**: `src/abi/setStoneABI.js`
- **Status**: ✅ DEPLOYED & ACTIVE
- **Description**: NFT contract for Set Stones - algorithmic art derived from live show setlists. Each stone represents a set from a cryptograss show, with colors derived from the songs played.
- **Key Functions**:
  - `getShowData(artistId, blockheight)` - Get show metadata
  - `mintSetStone(...)` - Mint a new set stone
  - `getSetStone(tokenId)` - Get stone metadata
- **Explorer**: https://arbiscan.io/address/0x39269b3FddFc9bf0626e5CFe4424aa51A77f7678

### Blue Railroad Train (ERC-721)
- **Address**: `0xCe09A2d0d0BDE635722D8EF31901b430E651dB52`
- **Chain**: Arbitrum One
- **ABI**: `src/abi/blueRailroadABI.js`
- **Status**: ✅ DEPLOYED & ACTIVE
- **Description**: NFT contract for Blue Railroad Train Squats - exercise challenge tokens earned by performing squats to Tony Rice's "Blue Railroad Train". Users submit video evidence to Discord.
- **Key Functions**:
  - `mint(recipient, squatCount)` - Mint squat token
  - `getSquatData(tokenId)` - Get squat metadata
- **Explorer**: https://arbiscan.io/address/0xCe09A2d0d0BDE635722D8EF31901b430E651dB52

### Revealer Contributions
- **Address**: `0xa812137EFf2B368d0B2880A39B609fB60c426850`
- **Chain**: Ethereum Mainnet
- **ABI**: `src/abi/revealerContributionABI.js`
- **Status**: ✅ DEPLOYED & ACTIVE
- **Description**: Tracks ETH contributions to the "Vowel Sounds" album revealer. Contributors are ranked by amount and displayed on the artifacts page. Note: This is NOT an ERC-721 - it only tracks contributions, not ownership of NFTs.
- **Key Functions**:
  - `getContributionsMetadata()` - Get all contributions
- **Explorer**: https://etherscan.io/address/0xa812137EFf2B368d0B2880A39B609fB60c426850

## Not Yet Deployed

### Ticket Stub Claimer (ERC-721)
- **Placeholder Address**: `0x1234567890123456789012345678901234567890`
- **Intended Chain**: Arbitrum One
- **ABI**: `src/abi/ticketStubClaimerABI.js`
- **Status**: ❌ NOT DEPLOYED
- **Description**: ERC-721 for digital ticket stubs. Physical tickets include QR codes with secrets; scanning and entering the secret claims the NFT to your wallet.
- **Key Functions**:
  - `createTicketStubsForShow(showId, secretHashes[])` - Create ticket stubs for a show (admin)
  - `claimTicketStub(secret)` - Claim a ticket stub using the secret from physical ticket
  - `canClaim(secret)` - Check if a secret is valid and unclaimed
  - `getTicketStub(tokenId)` - Get stub metadata
- **Frontend**: Claim pages exist at `/blox-office/ticketstubs/claim/{tokenId}.html`
- **TODO**:
  - [ ] Deploy contract to Arbitrum
  - [ ] Update address in `src/build_logic/constants.js`
  - [ ] Create ticket stubs for Prague/Porcupine shows
  - [ ] Related issues: #258, #309, #311

### Chartifacts (ERC-721)
- **Status**: ❌ NOT DEPLOYED - No contract exists yet
- **Intended Chain**: TBD
- **Description**: NFTs representing studio recording charts. Each chartifact shows who played what on a specific song, with the chart image as the NFT.
- **Frontend**: Chartifacts player exists and displays mock ownership data
- **TODO**:
  - [ ] Design contract (what metadata? what minting mechanism?)
  - [ ] Related issues: Check for existing design issues

### Revealerfacts (ERC-721)
- **Status**: ❌ NOT DEPLOYED - Contributions tracked, but no NFTs minted
- **Description**: Potential upgrade to revealer system - mint NFTs for contributors based on their contribution tier.
- **TODO**:
  - [ ] Decide if this should be a new contract or extension
  - [ ] Design tier system and NFT metadata

## Other Contract References

### Magic Hat
- **Address**: `0xBcf07C8a9Fc60B6C173c113Fa7CFDC97C846Dcad`
- **Chain**: Unknown (check code)
- **ABI**: `src/abi/magichatABI.js`
- **Used in**: `src/sites/justinholmes.com/js/magic_hat.js`

### Live Set
- **Address**: `0xd16B72c7453133eA4406237A83014F3f8a9d581F`
- **ABI**: `src/abi/liveSetABI.js`
- **Used in**: `src/sites/cryptograss.live/js/tools/add_live_set.js`

## Infrastructure

### Constants File
All contract addresses are centralized in:
- `src/build_logic/constants.js`

### Chain Reading
Chain data is fetched during build:
- `npm run fetch-chain-data`
- Code: `src/build_logic/chain_reading.js`
- Caches to: `output/_prebuild_chain_data/`

### Supported Chains
- Arbitrum One (Set Stones, Blue Railroad, Ticket Stubs)
- Ethereum Mainnet (Revealer)
- Optimism (some infrastructure)

---
*Last updated: December 2024*
