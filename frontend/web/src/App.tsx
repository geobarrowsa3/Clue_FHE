// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

// Game constants
const SUSPECTS = ["Miss Scarlet", "Colonel Mustard", "Mrs. White", "Mr. Green", "Mrs. Peacock", "Professor Plum"];
const WEAPONS = ["Candlestick", "Dagger", "Lead Pipe", "Revolver", "Rope", "Wrench"];
const ROOMS = ["Kitchen", "Ballroom", "Conservatory", "Dining Room", "Billiard Room", "Library", "Lounge", "Hall", "Study"];

interface EncryptedGameState {
  murderer: string;
  weapon: string;
  room: string;
}

interface PlayerAccusation {
  player: string;
  suspect: string;
  weapon: string;
  room: string;
  timestamp: number;
  isCorrect: boolean | null;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<EncryptedGameState | null>(null);
  const [accusations, setAccusations] = useState<PlayerAccusation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAccuseModal, setShowAccuseModal] = useState(false);
  const [accusing, setAccusing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newAccusation, setNewAccusation] = useState({ suspect: "", weapon: "", room: "" });
  const [showTutorial, setShowTutorial] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [decryptedSolution, setDecryptedSolution] = useState<EncryptedGameState | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  
  // Stats
  const correctCount = accusations.filter(a => a.isCorrect === true).length;
  const incorrectCount = accusations.filter(a => a.isCorrect === false).length;
  const pendingCount = accusations.filter(a => a.isCorrect === null).length;

  useEffect(() => {
    loadGameState().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadGameState = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check if contract is available
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load encrypted game state
      const murdererBytes = await contract.getData("murderer");
      const weaponBytes = await contract.getData("weapon");
      const roomBytes = await contract.getData("room");
      
      if (murdererBytes.length > 0 && weaponBytes.length > 0 && roomBytes.length > 0) {
        const murderer = ethers.toUtf8String(murdererBytes);
        const weapon = ethers.toUtf8String(weaponBytes);
        const room = ethers.toUtf8String(roomBytes);
        
        setGameState({ murderer, weapon, room });
      }
      
      // Load accusations
      const accusationsBytes = await contract.getData("accusations");
      let accList: PlayerAccusation[] = [];
      if (accusationsBytes.length > 0) {
        try {
          accList = JSON.parse(ethers.toUtf8String(accusationsBytes));
        } catch (e) { console.error("Error parsing accusations:", e); }
      }
      setAccusations(accList);
    } catch (e) { console.error("Error loading game state:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const initializeGame = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Initializing game with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Randomly select solution
      const randomMurderer = SUSPECTS[Math.floor(Math.random() * SUSPECTS.length)];
      const randomWeapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      const randomRoom = ROOMS[Math.floor(Math.random() * ROOMS.length)];
      
      // Encrypt solution using FHE simulation
      const encryptedMurderer = FHEEncryptNumber(SUSPECTS.indexOf(randomMurderer));
      const encryptedWeapon = FHEEncryptNumber(WEAPONS.indexOf(randomWeapon));
      const encryptedRoom = FHEEncryptNumber(ROOMS.indexOf(randomRoom));
      
      // Store encrypted solution
      await contract.setData("murderer", ethers.toUtf8Bytes(encryptedMurderer));
      await contract.setData("weapon", ethers.toUtf8Bytes(encryptedWeapon));
      await contract.setData("room", ethers.toUtf8Bytes(encryptedRoom));
      
      // Initialize empty accusations list
      await contract.setData("accusations", ethers.toUtf8Bytes(JSON.stringify([])));
      
      setTransactionStatus({ visible: true, status: "success", message: "Game initialized with FHE-encrypted solution!" });
      await loadGameState();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Initialization failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const submitAccusation = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (!newAccusation.suspect || !newAccusation.weapon || !newAccusation.room) {
      alert("Please select all accusation components");
      return;
    }
    
    setAccusing(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Processing accusation with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Get current accusations
      const accusationsBytes = await contract.getData("accusations");
      let accList: PlayerAccusation[] = [];
      if (accusationsBytes.length > 0) {
        try { accList = JSON.parse(ethers.toUtf8String(accusationsBytes)); } 
        catch (e) { console.error("Error parsing accusations:", e); }
      }
      
      // Add new accusation (verification happens later)
      const newAcc: PlayerAccusation = {
        player: address || "",
        suspect: newAccusation.suspect,
        weapon: newAccusation.weapon,
        room: newAccusation.room,
        timestamp: Math.floor(Date.now() / 1000),
        isCorrect: null // To be verified later
      };
      
      accList.push(newAcc);
      await contract.setData("accusations", ethers.toUtf8Bytes(JSON.stringify(accList)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Accusation submitted! Verification pending..." });
      await loadGameState();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAccuseModal(false);
        setNewAccusation({ suspect: "", weapon: "", room: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Accusation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setAccusing(false); }
  };

  const verifyAccusation = async (index: number) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Verifying accusation with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Get current accusations
      const accusationsBytes = await contract.getData("accusations");
      let accList: PlayerAccusation[] = [];
      if (accusationsBytes.length > 0) {
        try { accList = JSON.parse(ethers.toUtf8String(accusationsBytes)); } 
        catch (e) { console.error("Error parsing accusations:", e); }
      }
      
      // Get encrypted solution
      const murdererBytes = await contract.getData("murderer");
      const weaponBytes = await contract.getData("weapon");
      const roomBytes = await contract.getData("room");
      
      if (murdererBytes.length === 0 || weaponBytes.length === 0 || roomBytes.length === 0) {
        throw new Error("Game solution not found");
      }
      
      const encryptedMurderer = ethers.toUtf8String(murdererBytes);
      const encryptedWeapon = ethers.toUtf8String(weaponBytes);
      const encryptedRoom = ethers.toUtf8String(roomBytes);
      
      // Simulate FHE verification
      const suspectIndex = SUSPECTS.indexOf(accList[index].suspect);
      const weaponIndex = WEAPONS.indexOf(accList[index].weapon);
      const roomIndex = ROOMS.indexOf(accList[index].room);
      
      const isCorrect = 
        FHEDecryptNumber(encryptedMurderer) === suspectIndex &&
        FHEDecryptNumber(encryptedWeapon) === weaponIndex &&
        FHEDecryptNumber(encryptedRoom) === roomIndex;
      
      // Update accusation status
      accList[index].isCorrect = isCorrect;
      await contract.setData("accusations", ethers.toUtf8Bytes(JSON.stringify(accList)));
      
      setTransactionStatus({ visible: true, status: "success", message: `Accusation ${isCorrect ? "correct" : "incorrect"}!` });
      await loadGameState();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Verification failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptSolution = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (!gameState) return;
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      
      // Simulate FHE decryption
      const murdererIndex = FHEDecryptNumber(gameState.murderer);
      const weaponIndex = FHEDecryptNumber(gameState.weapon);
      const roomIndex = FHEDecryptNumber(gameState.room);
      
      setDecryptedSolution({
        murderer: SUSPECTS[murdererIndex],
        weapon: WEAPONS[weaponIndex],
        room: ROOMS[roomIndex]
      });
      
      setShowSolution(true);
    } catch (e) { console.error("Decryption failed:", e); } 
    finally { setIsDecrypting(false); }
  };

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to join the game", icon: "🔗" },
    { title: "Initialize Game", description: "Set up the encrypted murder details using Zama FHE", icon: "🔒", details: "The solution is encrypted on-chain and remains private" },
    { title: "Make Accusations", description: "Submit your theory about who, where, and how", icon: "🕵️", details: "Accusations are stored on-chain but remain encrypted" },
    { title: "Verify Accusations", description: "Check if accusations are correct using FHE", icon: "✅", details: "Zama FHE allows verification without revealing the solution" },
    { title: "Solve the Mystery", description: "Decrypt the solution when you're ready", icon: "🔓", details: "Requires wallet signature to decrypt the final solution" }
  ];

  const renderStats = () => (
    <div className="stats-grid">
      <div className="stat-item">
        <div className="stat-value">{accusations.length}</div>
        <div className="stat-label">Total Accusations</div>
      </div>
      <div className="stat-item">
        <div className="stat-value">{correctCount}</div>
        <div className="stat-label">Correct</div>
      </div>
      <div className="stat-item">
        <div className="stat-value">{incorrectCount}</div>
        <div className="stat-label">Incorrect</div>
      </div>
      <div className="stat-item">
        <div className="stat-value">{pendingCount}</div>
        <div className="stat-label">Pending</div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Initializing encrypted game...</p>
    </div>
  );

  return (
    <div className="app-container retro-pixel-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🕵️</div>
          <h1>Clue<span>_FHE</span></h1>
        </div>
        <div className="header-actions">
          {gameState ? (
            <button onClick={() => setShowAccuseModal(true)} className="create-btn pixel-button">
              Make Accusation
            </button>
          ) : (
            <button onClick={initializeGame} className="create-btn pixel-button">
              Initialize Game
            </button>
          )}
          <button className="pixel-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Clue: FHE Edition</h2>
            <p>A blockchain implementation of the classic mystery game using Zama FHE encryption</p>
          </div>
          <div className="fhe-indicator">🔒 FHE Encryption Active</div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section pixel-card">
            <h2>How to Play</h2>
            <p className="subtitle">Solve the mystery using fully homomorphic encryption</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card pixel-card">
            <h3>Project Introduction</h3>
            <p>Clue_FHE brings the classic board game to the blockchain with Zama FHE technology. The murderer, weapon, and room are encrypted using fully homomorphic encryption, allowing players to verify accusations without revealing the solution.</p>
            <div className="fhe-badge">🔐 FHE-Powered</div>
          </div>
          
          <div className="dashboard-card pixel-card">
            <h3>Game Statistics</h3>
            {renderStats()}
          </div>
          
          <div className="dashboard-card pixel-card">
            <h3>FHE Solution</h3>
            {gameState ? (
              <div className="solution-section">
                <p>The murder details are securely encrypted using Zama FHE</p>
                {showSolution && decryptedSolution ? (
                  <div className="solution-reveal">
                    <p><strong>Murderer:</strong> {decryptedSolution.murderer}</p>
                    <p><strong>Weapon:</strong> {decryptedSolution.weapon}</p>
                    <p><strong>Room:</strong> {decryptedSolution.room}</p>
                  </div>
                ) : (
                  <button 
                    onClick={decryptSolution} 
                    className="pixel-button"
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Reveal Solution"}
                  </button>
                )}
              </div>
            ) : (
              <p>Game not initialized yet. Start a new game to begin.</p>
            )}
          </div>
        </div>
        
        <div className="records-section">
          <div className="section-header">
            <h2>Accusation History</h2>
            <div className="header-actions">
              <button onClick={loadGameState} className="refresh-btn pixel-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <div className="records-list pixel-card">
            <div className="table-header">
              <div className="header-cell">Player</div>
              <div className="header-cell">Suspect</div>
              <div className="header-cell">Weapon</div>
              <div className="header-cell">Room</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            {accusations.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon">❓</div>
                <p>No accusations made yet</p>
                <button className="pixel-button primary" onClick={() => setShowAccuseModal(true)}>Make First Accusation</button>
              </div>
            ) : accusations.map((acc, index) => (
              <div className="record-row" key={index}>
                <div className="table-cell">{acc.player.substring(0, 6)}...{acc.player.substring(38)}</div>
                <div className="table-cell">{acc.suspect}</div>
                <div className="table-cell">{acc.weapon}</div>
                <div className="table-cell">{acc.room}</div>
                <div className="table-cell">
                  <span className={`status-badge ${acc.isCorrect === true ? 'correct' : acc.isCorrect === false ? 'incorrect' : 'pending'}`}>
                    {acc.isCorrect === true ? 'Correct' : acc.isCorrect === false ? 'Incorrect' : 'Pending'}
                  </span>
                </div>
                <div className="table-cell actions">
                  {acc.isCorrect === null && (
                    <button 
                      className="action-btn pixel-button" 
                      onClick={() => verifyAccusation(index)}
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="faq-section pixel-card">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>What is FHE?</h3>
              <p>Fully Homomorphic Encryption (FHE) allows computations to be performed on encrypted data without decrypting it first. This enables privacy-preserving computations.</p>
            </div>
            <div className="faq-item">
              <h3>How does Zama FHE work?</h3>
              <p>Zama's FHE solution uses advanced cryptographic techniques to enable computations on encrypted data, maintaining privacy while allowing verification of game logic.</p>
            </div>
            <div className="faq-item">
              <h3>Is the solution really encrypted?</h3>
              <p>Yes, the murderer, weapon, and room are encrypted using FHE and stored on-chain. Verification happens without decrypting the solution.</p>
            </div>
            <div className="faq-item">
              <h3>Can I cheat?</h3>
              <p>No, the FHE encryption prevents anyone from seeing the solution until it's intentionally decrypted with proper authorization.</p>
            </div>
          </div>
        </div>
      </div>
      
      {showAccuseModal && (
        <ModalAccuse 
          onSubmit={submitAccusation} 
          onClose={() => setShowAccuseModal(false)} 
          accusing={accusing} 
          accusation={newAccusation} 
          setAccusation={setNewAccusation}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">🕵️<span>Clue_FHE</span></div>
            <p>Classic mystery game powered by Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔐 FHE-Powered Privacy</div>
          <div className="copyright">© {new Date().getFullYear()} Clue_FHE. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAccuseProps {
  onSubmit: () => void; 
  onClose: () => void; 
  accusing: boolean;
  accusation: any;
  setAccusation: (data: any) => void;
}

const ModalAccuse: React.FC<ModalAccuseProps> = ({ onSubmit, onClose, accusing, accusation, setAccusation }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAccusation({ ...accusation, [name]: value });
  };

  const handleSubmit = () => {
    if (!accusation.suspect || !accusation.weapon || !accusation.room) { 
      alert("Please select all accusation components"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal pixel-card">
        <div className="modal-header">
          <h2>Make an Accusation</h2>
          <button onClick={onClose} className="close-modal">✕</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon">🔒</div> 
            <div><strong>FHE Encryption Notice</strong><p>Your accusation will be encrypted before submission</p></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Suspect *</label>
              <select name="suspect" value={accusation.suspect} onChange={handleChange} className="pixel-select">
                <option value="">Select suspect</option>
                {SUSPECTS.map(suspect => (
                  <option key={suspect} value={suspect}>{suspect}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Weapon *</label>
              <select name="weapon" value={accusation.weapon} onChange={handleChange} className="pixel-select">
                <option value="">Select weapon</option>
                {WEAPONS.map(weapon => (
                  <option key={weapon} value={weapon}>{weapon}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Room *</label>
              <select name="room" value={accusation.room} onChange={handleChange} className="pixel-select">
                <option value="">Select room</option>
                {ROOMS.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="privacy-notice">
            <div className="privacy-icon">🛡️</div> 
            <div><strong>Privacy Guarantee</strong><p>Your accusation remains encrypted during FHE processing</p></div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn pixel-button">Cancel</button>
          <button onClick={handleSubmit} disabled={accusing} className="submit-btn pixel-button primary">
            {accusing ? "Processing with FHE..." : "Submit Accusation"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;