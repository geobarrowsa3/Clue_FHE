pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ClueBoardGameFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    // Custom errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error InvalidState();
    error RateLimited();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error StaleVersion();
    error AlreadyProcessed();

    // Events
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused();
    event Unpaused();
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event Submission(
        address indexed player,
        uint256 indexed batchId,
        bytes32 encryptedWeapon,
        bytes32 encryptedRoom,
        bytes32 encryptedSuspect
    );
    event DecryptionRequested(
        uint256 indexed requestId,
        uint256 indexed batchId,
        bytes32 stateHash
    );
    event DecryptionComplete(
        uint256 indexed requestId,
        uint256 indexed batchId,
        uint256[3] solution
    );
    event Accusation(
        address indexed player,
        uint256 indexed batchId,
        bool isCorrect
    );

    // State
    address public owner;
    bool public paused;
    uint256 public cooldownSeconds = 30;
    uint256 public currentBatchId = 0;
    uint256 public modelVersion = 1;
    uint256 public constant MAX_BATCH_SIZE = 10;

    // Mappings
    mapping(address => bool) public providers;
    mapping(address => uint256) public lastSubmissionAt;
    mapping(address => uint256) public lastRequestAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;
    mapping(uint256 => mapping(address => bool)) public hasRequested;

    // Structs
    struct Batch {
        bool isOpen;
        uint256 submissionCount;
        euint32 encryptedWeapon;
        euint32 encryptedRoom;
        euint32 encryptedSuspect;
        mapping(address => bool) submitted;
    }

    struct DecryptionContext {
        uint256 batchId;
        uint256 modelVersion;
        bytes32 stateHash;
        bool processed;
    }

    // Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown(address caller, mapping(address => uint256) storage lastAction) {
        if (block.timestamp < lastAction[caller] + cooldownSeconds) {
            revert RateLimited();
        }
        _;
    }

    // Constructor
    constructor() {
        owner = msg.sender;
    }

    // Admin functions
    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    // Batch management
    function openBatch() external onlyOwner {
        currentBatchId++;
        batches[currentBatchId].isOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (!batches[batchId].isOpen) revert BatchClosed();
        batches[batchId].isOpen = false;
        emit BatchClosed(batchId);
    }

    // Player actions
    function submitEncryptedGuess(
        uint256 batchId,
        euint32 encryptedWeapon,
        euint32 encryptedRoom,
        euint32 encryptedSuspect
    ) external whenNotPaused checkCooldown(msg.sender, lastSubmissionAt) {
        if (!batches[batchId].isOpen) revert BatchClosed();
        if (batches[batchId].submissionCount >= MAX_BATCH_SIZE) revert BatchFull();
        if (hasSubmitted[batchId][msg.sender]) revert InvalidState();

        // Initialize accumulators if needed
        _initIfNeeded(batches[batchId].encryptedWeapon);
        _initIfNeeded(batches[batchId].encryptedRoom);
        _initIfNeeded(batches[batchId].encryptedSuspect);

        // Aggregate encrypted guesses
        batches[batchId].encryptedWeapon = FHE.add(
            batches[batchId].encryptedWeapon,
            encryptedWeapon
        );
        batches[batchId].encryptedRoom = FHE.add(
            batches[batchId].encryptedRoom,
            encryptedRoom
        );
        batches[batchId].encryptedSuspect = FHE.add(
            batches[batchId].encryptedSuspect,
            encryptedSuspect
        );

        batches[batchId].submissionCount++;
        hasSubmitted[batchId][msg.sender] = true;
        lastSubmissionAt[msg.sender] = block.timestamp;

        emit Submission(
            msg.sender,
            batchId,
            FHE.toBytes32(encryptedWeapon),
            FHE.toBytes32(encryptedRoom),
            FHE.toBytes32(encryptedSuspect)
        );
    }

    function makeAccusation(
        uint256 batchId,
        euint32 encryptedWeapon,
        euint32 encryptedRoom,
        euint32 encryptedSuspect
    ) external whenNotPaused checkCooldown(msg.sender, lastSubmissionAt) {
        if (!batches[batchId].isOpen) revert BatchClosed();
        if (hasSubmitted[batchId][msg.sender]) revert InvalidState();

        // Initialize accumulators if needed
        _initIfNeeded(batches[batchId].encryptedWeapon);
        _initIfNeeded(batches[batchId].encryptedRoom);
        _initIfNeeded(batches[batchId].encryptedSuspect);

        // Compare encrypted accusation with batch aggregates
        ebool weaponMatch = FHE.eq(
            batches[batchId].encryptedWeapon,
            encryptedWeapon
        );
        ebool roomMatch = FHE.eq(
            batches[batchId].encryptedRoom,
            encryptedRoom
        );
        ebool suspectMatch = FHE.eq(
            batches[batchId].encryptedSuspect,
            encryptedSuspect
        );
        ebool isCorrect = FHE.and(FHE.and(weaponMatch, roomMatch), suspectMatch);

        // Request decryption for the match result
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isCorrect);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleAccusationCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            modelVersion: modelVersion,
            stateHash: stateHash,
            processed: false
        });

        hasSubmitted[batchId][msg.sender] = true;
        lastSubmissionAt[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function requestBatchSolution(uint256 batchId)
        external
        whenNotPaused
        checkCooldown(msg.sender, lastRequestAt)
    {
        if (batches[batchId].submissionCount == 0) revert InvalidBatch();
        if (hasRequested[batchId][msg.sender]) revert InvalidState();

        // Build ciphertext array
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(batches[batchId].encryptedWeapon);
        cts[1] = FHE.toBytes32(batches[batchId].encryptedRoom);
        cts[2] = FHE.toBytes32(batches[batchId].encryptedSuspect);

        // Compute state hash and request decryption
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleBatchSolutionCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            modelVersion: modelVersion,
            stateHash: stateHash,
            processed: false
        });

        hasRequested[batchId][msg.sender] = true;
        lastRequestAt[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    // Callbacks
    function handleAccusationCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext memory context = decryptionContexts[requestId];
        if (context.processed) revert AlreadyProcessed();
        if (context.modelVersion != modelVersion) revert StaleVersion();

        // Rebuild ciphertexts and verify state hash
        ebool isCorrect = _rebuildIsCorrect(context.batchId);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isCorrect);
        bytes32 currHash = _hashCiphertexts(cts);

        if (currHash != context.stateHash) revert InvalidState();

        // Verify proof and decode
        FHE.checkSignatures(requestId, cleartexts, proof);
        bool result = abi.decode(cleartexts, (bool));

        // Update context and emit
        decryptionContexts[requestId].processed = true;
        emit Accusation(msg.sender, context.batchId, result);
    }

    function handleBatchSolutionCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext memory context = decryptionContexts[requestId];
        if (context.processed) revert AlreadyProcessed();
        if (context.modelVersion != modelVersion) revert StaleVersion();

        // Rebuild ciphertexts and verify state hash
        (
            euint32 weapon,
            euint32 room,
            euint32 suspect
        ) = _rebuildBatchSolution(context.batchId);
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(weapon);
        cts[1] = FHE.toBytes32(room);
        cts[2] = FHE.toBytes32(suspect);
        bytes32 currHash = _hashCiphertexts(cts);

        if (currHash != context.stateHash) revert InvalidState();

        // Verify proof and decode
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint256[3] memory solution = abi.decode(cleartexts, (uint256[3]));

        // Update context and emit
        decryptionContexts[requestId].processed = true;
        emit DecryptionComplete(requestId, context.batchId, solution);
    }

    // Internal helpers
    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal view returns (euint32) {
        return FHE.isInitialized(x) ? x : FHE.asEuint32(0);
    }

    function _requireInitialized(euint32 x, string memory tag) internal view {
        if (!FHE.isInitialized(x)) revert InvalidState();
    }

    function _rebuildIsCorrect(uint256 batchId) internal view returns (ebool) {
        _requireInitialized(batches[batchId].encryptedWeapon, "weapon");
        _requireInitialized(batches[batchId].encryptedRoom, "room");
        _requireInitialized(batches[batchId].encryptedSuspect, "suspect");
        // In a real implementation, this would rebuild the comparison logic
        return FHE.asEbool(false); // Placeholder
    }

    function _rebuildBatchSolution(uint256 batchId)
        internal
        view
        returns (
            euint32,
            euint32,
            euint32
        )
    {
        _requireInitialized(batches[batchId].encryptedWeapon, "weapon");
        _requireInitialized(batches[batchId].encryptedRoom, "room");
        _requireInitialized(batches[batchId].encryptedSuspect, "suspect");
        return (
            batches[batchId].encryptedWeapon,
            batches[batchId].encryptedRoom,
            batches[batchId].encryptedSuspect
        );
    }
}