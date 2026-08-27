# Oil

Private Solidity workspace for permit-style USDC transfer request flows.

## Included Contracts

- `contracts/PermitRequestUSDC.sol`  
  Request-record contract only (stores and emits request data).
- `contracts/ExecutablePermitRequestUSDC.sol`  
  One-time executable request contract that can call `transferFrom` after allowance is set.

## Quick Start (Hardhat)

```bash
npm install
cp .env.example .env
npx hardhat compile
npx hardhat test
```

## Deploy

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

## Verify on Etherscan (Sepolia)

1. Set env vars in `.env`:

```bash
ETHERSCAN_API_KEY=...
CONTRACT_ADDRESS=0xYourDeployedContract
OWNER_ADDRESS=0xOwnerPassedToConstructor
```

2. Run verify script:

```bash
npm run verify:sepolia
```

## Safety Notes

- Verify all addresses and chain IDs before deployment.
- USDC uses 6 decimals.
- `ExecutablePermitRequestUSDC` requires allowance to the deployed contract before execution.
- This repository is a template and does not implement full EIP-7702 logic.
