# Clue FHE: Encrypted Mystery Awaits 🔍

Discover the modern take on the classic board game "Clue" where thrilling deductions meet cutting-edge security! Powered by **Zama's Fully Homomorphic Encryption technology**, Clue FHE delivers a unique, trustworthy gaming experience where the identities of the murderer, weapon, and location remain safely encrypted. Players use cryptographic reasoning to solve the mystery, ensuring a fair and enjoyable time for family and friends.

## The Challenge: Mystery and Trust

In traditional games, players often grapple with suspicions of cheating, which can detract from the fun and excitement of gameplay. "Clue" thrives on the secretive nature of its suspects, but the environment can become contentious when players challenge one another's deductions or integrity. The core problem lies in creating a shared gaming experience that allows players to engage in juicy detective work without compromising trust or the game's integrity.

## A Revolutionary FHE Solution

Enter Clue FHE, where **Zama's Fully Homomorphic Encryption technology** transforms the way players interact with sensitive game data. By leveraging **Zama's open-source libraries**, such as **Concrete** and the **zama-fhe SDK**, Clue FHE ensures that critical information—namely the murderer, weapon, and location—remains encrypted throughout the game. This implementation allows for secure gameplay, where players’ deductions and accusations are verified against encrypted data, keeping the culprits hidden while allowing thrilling gameplay to unfold.

## Key Features

- **Encrypted Secrets**: The identities of the murderer, weapon, and room are kept in an encrypted envelope, accessible only through cryptographic validation.
- **Homomorphic Execution for Deductions**: Players can make claims and deduce the mystery without ever unveiling the sensitive data.
- **Authentic Gameplay Experience**: Clue FHE perfectly captures the logic and flow of the traditional board game while preventing any cheating attempts.
- **Suitable for All Gatherings**: Ideal for family game nights or parties with friends, this digital adaptation enables a seamless and engaging experience.

## Technology Stack

- **Zama SDK**: Essential for secure data handling and confidential computing.
- **Node.js**: Backend environment for running the game's server.
- **Hardhat or Foundry**: Development framework to manage the game’s smart contracts.
- **React**: For creating a responsive front-end interface.
- **Tailwind CSS**: For styling and responsive design.

## Directory Structure

```plaintext
Clue_FHE/
├── contracts/
│   └── Clue_FHE.sol
├── src/
│   ├── index.js
│   ├── components/
│   │   └── GameBoard.js
│   └── styles/
│       └── App.css
├── package.json
└── README.md
```

## Installation Instructions

Before diving into the game, ensure your environment is set up correctly. **Please do not use `git clone` or any URLs to download the project.** Follow the steps below to get started:

1. Make sure you have **Node.js** installed. (You can download it from the official Node.js website.)
2. Install **Hardhat** or **Foundry** by following their respective installation guides.
3. Download the Clue FHE project files.
4. Navigate to the project directory in your terminal and run the following command to install dependencies:

   ```bash
   npm install
   ```

This command will fetch the necessary Zama FHE libraries along with other dependencies.

## Build & Run Instructions

With the installation completed, you are now ready to build and run the project:

1. To compile the smart contracts, execute:

   ```bash
   npx hardhat compile
   ```

2. For running tests on the contracts, use:

   ```bash
   npx hardhat test
   ```

3. Start the game server with:

   ```bash
   npm run start
   ```

4. Open your browser and navigate to `http://localhost:3000` (or the specified port) to start playing Clue FHE with friends!

## Example Code Snippet

Here’s a glimpse of how the game logic verifies a player's deduction using Zama's FHE functionality:

```javascript
async function verifyDeduction(playerAccusation) {
    const encryptedData = await getEncryptedGameData();
    const result = await FHE.execute(encryptedData, playerAccusation);
    
    if (result.isCorrect) {
        console.log("Correct deduction! 🎉");
    } else {
        console.log("Oops! That's not it. Try again! 🕵️");
    }
}
```
In this snippet, the `verifyDeduction` function checks a player’s accusation against the encrypted game data, leveraging our FHE implementation for an authentic verification process.

## Acknowledgements

**Powered by Zama**: A heartfelt thank you to the Zama team for their pioneering work in the field of Fully Homomorphic Encryption and for providing the open-source tools that make confidential blockchain applications, such as Clue FHE, possible. Your contributions are vital to the future of secure gaming experiences! 🎉
