// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title TicketStubClaimer
 * @dev NFT contract for claiming physical ticket stubs with secrets
 * 
 * This contract bridges physical ticket stubs distributed at shows to digital NFTs.
 * Each ticket stub contains a secret that can be used to claim the corresponding NFT.
 * This replaces the previous "rabbit secrets" paradigm for set stone minting.
 * 
 * QR codes on ticket stubs point to: 
 * https://cryptograss.live/blox-office/ticketstubs/claim/{tokenId}?secret={secret}
 */
contract TicketStubClaimer is ERC721, Ownable, ReentrancyGuard {
    
    /// @dev Struct to store ticket stub data with embedded show information
    struct TicketStub {
        uint8[] bandIds;          // Array of band IDs for this show (e.g., [0, 7])
        uint32 blockheight;       // Show blockheight (e.g., 22748946)
        bytes32 secretHash;       // Keccak256 hash of the secret from physical ticket
        address claimedBy;        // Address that claimed it (address(0) if unclaimed)
        uint32 claimedAt;         // Block number when claimed
        bool exists;              // Whether this token exists
    }
    
    /// @dev Mapping from token ID to ticket stub data
    mapping(uint32 => TicketStub) public ticketStubs;
    
    /// @dev Mapping from band ID to array of token IDs (for reverse lookup)
    mapping(uint8 => uint32[]) public tokensByBand;
    
    /// @dev Mapping from blockheight to array of token IDs (for reverse lookup)  
    mapping(uint32 => uint32[]) public tokensByBlockheight;
    
    /// @dev Next available token ID (starts at 0)
    uint32 public nextTokenId = 0;
    
    /// @dev Emitted when new ticket stubs are created for a show
    event TicketStubCreated(uint32 indexed tokenId, uint8[] bandIds, uint32 indexed blockheight, bytes32 secretHash);
    
    /// @dev Emitted when a ticket stub is successfully claimed
    event TicketStubClaimed(uint32 indexed tokenId, address indexed claimedBy);
    
    /// @dev Emitted when ticket stubs are created for a show
    event ShowTicketStubsCreated(uint8[] bandIds, uint32 indexed blockheight, uint32 count);
    
    constructor() ERC721("Cryptograss Ticket Stub", "CGTS") {}
    
    /**
     * @dev Creates ticket stubs for a show with pre-computed secret hashes
     * @param bandIds Array of band IDs participating in this show (uint8 for gas efficiency)
     * @param blockheight The blockheight of the show
     * @param secretHashes Array of keccak256 hashes of the secrets
     * 
     * Only the contract owner can create ticket stubs. The secrets should be
     * generated off-chain and their hashes stored here for claiming.
     */
    function createTicketStubsForShow(
        uint8[] calldata bandIds,
        uint32 blockheight,
        bytes32[] calldata secretHashes
    ) external onlyOwner {
        require(secretHashes.length > 0, "Must create at least one ticket stub");
        require(bandIds.length > 0, "Must have at least one band");
        require(blockheight > 0, "Blockheight must be positive");
        
        // Create ticket stubs
        for (uint i = 0; i < secretHashes.length; i++) {
            require(secretHashes[i] != bytes32(0), "Secret hash cannot be zero");
            
            uint32 tokenId = nextTokenId++;
            
            ticketStubs[tokenId] = TicketStub({
                bandIds: bandIds,
                blockheight: blockheight,
                secretHash: secretHashes[i],
                claimedBy: address(0),
                claimedAt: 0,
                exists: true
            });
            
            // Add to reverse lookup mappings
            for (uint j = 0; j < bandIds.length; j++) {
                tokensByBand[bandIds[j]].push(tokenId);
            }
            tokensByBlockheight[blockheight].push(tokenId);
            
            emit TicketStubCreated(tokenId, bandIds, blockheight, secretHashes[i]);
        }
        
        emit ShowTicketStubsCreated(bandIds, blockheight, uint32(secretHashes.length));
    }
    
    /**
     * @dev Claims a ticket stub using the secret from the physical ticket
     * @param tokenId The ID of the ticket stub to claim
     * @param secret The secret printed on the physical ticket stub
     * 
     * The secret is hashed and compared against the stored hash. If valid,
     * the NFT is minted to the caller's address.
     */
    function claimTicketStub(uint32 tokenId, string calldata secret) external nonReentrant {
        require(ticketStubs[tokenId].exists, "Ticket stub does not exist");
        require(ticketStubs[tokenId].claimedBy == address(0), "Ticket stub already claimed");
        require(bytes(secret).length > 0, "Secret cannot be empty");
        
        bytes32 hashedSecret = keccak256(abi.encodePacked(secret));
        require(ticketStubs[tokenId].secretHash == hashedSecret, "Invalid secret");
        
        // Mark as claimed
        ticketStubs[tokenId].claimedBy = msg.sender;
        ticketStubs[tokenId].claimedAt = uint32(block.number);
        
        // Mint the NFT to the claimer
        _mint(msg.sender, tokenId);
        
        emit TicketStubClaimed(tokenId, msg.sender);
    }

    /**
     * @dev Claims a ticket stub on behalf of a specified recipient using the secret
     * @param tokenId The ID of the ticket stub to claim
     * @param secret The secret printed on the physical ticket stub
     * @param recipient The address to mint the NFT to
     *
     * Identical to `claimTicketStub` except the NFT is minted to `recipient` rather
     * than the caller. Enables relayer/gasless flows where a gas-paying third party
     * submits the claim transaction so the holder doesn't need ETH on the deployment
     * chain. The secret is the bearer instrument: whoever holds it can authorize a
     * mint to any address.
     */
    function claimTicketStubFor(uint32 tokenId, string calldata secret, address recipient) external nonReentrant {
        require(recipient != address(0), "Recipient cannot be zero address");
        require(ticketStubs[tokenId].exists, "Ticket stub does not exist");
        require(ticketStubs[tokenId].claimedBy == address(0), "Ticket stub already claimed");
        require(bytes(secret).length > 0, "Secret cannot be empty");

        bytes32 hashedSecret = keccak256(abi.encodePacked(secret));
        require(ticketStubs[tokenId].secretHash == hashedSecret, "Invalid secret");

        // Mark as claimed by the recipient (not the caller)
        ticketStubs[tokenId].claimedBy = recipient;
        ticketStubs[tokenId].claimedAt = uint32(block.number);

        // Mint the NFT to the recipient
        _mint(recipient, tokenId);

        emit TicketStubClaimed(tokenId, recipient);
    }

    /**
     * @dev Checks if a ticket stub can be claimed with the given secret
     * @param tokenId The ID of the ticket stub to check
     * @param secret The secret to validate
     * @return true if the ticket stub can be claimed with this secret
     */
    function canClaim(uint32 tokenId, string calldata secret) external view returns (bool) {
        if (!ticketStubs[tokenId].exists) return false;
        if (ticketStubs[tokenId].claimedBy != address(0)) return false;
        if (bytes(secret).length == 0) return false;
        
        bytes32 hashedSecret = keccak256(abi.encodePacked(secret));
        return ticketStubs[tokenId].secretHash == hashedSecret;
    }
    
    /**
     * @dev Returns the full ticket stub data for a given token ID
     * @param tokenId The token ID to query
     * @return The TicketStub struct containing all data
     */
    function getTicketStub(uint32 tokenId) external view returns (TicketStub memory) {
        require(ticketStubs[tokenId].exists, "Ticket stub does not exist");
        return ticketStubs[tokenId];
    }
    
    /**
     * @dev Returns all ticket stub token IDs for a given band
     * @param bandId The band identifier to query
     * @return Array of token IDs for the specified band
     */
    function getTicketStubsForBand(uint8 bandId) external view returns (uint32[] memory) {
        return tokensByBand[bandId];
    }
    
    /**
     * @dev Returns all ticket stub token IDs for a given blockheight
     * @param blockheight The blockheight to query
     * @return Array of token IDs for the specified blockheight
     */
    function getTicketStubsForBlockheight(uint32 blockheight) external view returns (uint32[] memory) {
        return tokensByBlockheight[blockheight];
    }
    
    /**
     * @dev Returns all ticket stub token IDs for a specific show (band combination + blockheight)
     * @param bandIds Array of band IDs for the show
     * @param blockheight The blockheight of the show
     * @return Array of token IDs for the specified show
     */
    function getTicketStubsForShow(uint8[] calldata bandIds, uint32 blockheight) external view returns (uint32[] memory) {
        uint32[] memory allTokensAtBlock = tokensByBlockheight[blockheight];
        uint32[] memory results = new uint32[](allTokensAtBlock.length);
        uint32 count = 0;
        
        for (uint i = 0; i < allTokensAtBlock.length; i++) {
            uint32 tokenId = allTokensAtBlock[i];
            if (ticketStubs[tokenId].exists && _arraysEqual(ticketStubs[tokenId].bandIds, bandIds)) {
                results[count] = tokenId;
                count++;
            }
        }
        
        // Resize array to actual count
        uint32[] memory finalResults = new uint32[](count);
        for (uint i = 0; i < count; i++) {
            finalResults[i] = results[i];
        }
        
        return finalResults;
    }
    
    /**
     * @dev Helper function to compare two uint8 arrays
     */
    function _arraysEqual(uint8[] memory a, uint8[] calldata b) internal pure returns (bool) {
        if (a.length != b.length) return false;
        for (uint i = 0; i < a.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }
    
    /**
     * @dev Returns the total number of ticket stubs created
     * @return The number of ticket stubs that have been created
     */
    function totalSupply() external view returns (uint32) {
        return nextTokenId;
    }
    
    /**
     * @dev Returns the number of claimed ticket stubs for a show
     * @param bandIds Array of band IDs for the show
     * @param blockheight The blockheight of the show
     * @return The number of claimed ticket stubs for the show
     */
    function getClaimedCountForShow(uint8[] calldata bandIds, uint32 blockheight) external view returns (uint32) {
        uint32[] memory showTokens = this.getTicketStubsForShow(bandIds, blockheight);
        uint32 count = 0;
        
        for (uint i = 0; i < showTokens.length; i++) {
            if (ticketStubs[showTokens[i]].claimedBy != address(0)) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * @dev Returns the total count of ticket stubs for a show (claimed + unclaimed)
     * @param bandIds Array of band IDs for the show
     * @param blockheight The blockheight of the show
     * @return The total number of ticket stubs created for the show
     */
    function getTotalCountForShow(uint8[] calldata bandIds, uint32 blockheight) external view returns (uint32) {
        return uint32(this.getTicketStubsForShow(bandIds, blockheight).length);
    }
    
    /**
     * @dev Check if a specific show has ticket stubs available
     * @param bandIds Array of band IDs for the show
     * @param blockheight The blockheight of the show
     * @return true if ticket stubs exist for this show
     */
    function hasTicketStubsForShow(uint8[] calldata bandIds, uint32 blockheight) external view returns (bool) {
        return this.getTicketStubsForShow(bandIds, blockheight).length > 0;
    }
    
    /**
     * @dev Generate a rabbit hash for compatibility with existing infrastructure
     * @param tokenId The token ID to generate hash for
     * @return The rabbit hash (first 8 bytes of secretHash as bytes32)
     */
    function getRabbitHash(uint32 tokenId) external view returns (bytes32) {
        require(ticketStubs[tokenId].exists, "Ticket stub does not exist");
        
        // Take first 8 bytes of the secret hash for display purposes
        bytes32 secretHash = ticketStubs[tokenId].secretHash;
        return bytes32(uint256(secretHash) & 0xFFFFFFFFFFFFFFFF);
    }
    
    /**
     * @dev Override tokenURI to point to ticket stub metadata
     * @param tokenId The token ID to get URI for
     * @return The metadata URI for the token
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(tokenId < nextTokenId, "URI query for nonexistent token");
        require(_exists(tokenId), "URI query for nonexistent token");
        
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 
            ? string(abi.encodePacked(baseURI, _toString(tokenId)))
            : "";
    }
    
    /**
     * @dev Set the base URI for token metadata
     * @param baseURI The new base URI
     */
    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }
    
    string private _baseTokenURI;
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }
    
    /**
     * @dev Internal function to convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}