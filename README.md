# Oil

Private Solidity workspace for permit-style USDC transfer request flows.

## Included Contracts

- `contracts/PermitRequestUSDC.sol`  
  Request-record contract only (stores and emits request data).
- `contracts/ExecutablePermitRequestUSDC.sol`  
  One-time executable request contract that can call `transferFrom` after allowance is set.

## Contract API

### `PermitRequestUSDC.submitRequest`
```solidity
function submitRequest(
    address usdcToken,
    uint256 amount,   // token amount in 6-decimal USDC units (must be > 0)
    uint256 chainId,
    uint256 deadline
) external returns (uint256 requestId)
```

### `ExecutablePermitRequestUSDC.submitRequest`
```solidity
function submitRequest(
    address usdcToken,
    uint256 amount,   // token amount in 6-decimal USDC units (must be > 0)
    uint256 deadline
) external returns (uint256 requestId)
```

Both contracts revert with `InvalidAmount()` when `amount == 0`.

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

## Auto-Deploy (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** | Every push / PR to `main` | Compiles + runs all tests |
| **Deploy to Sepolia (auto)** | Push to `main` that touches `contracts/` or `scripts/deploy.js` | Deploys both contracts to Sepolia and verifies on Etherscan |
| **Deploy (manual)** | Manual trigger via GitHub UI | Deploy to any supported network on demand |

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `SEPOLIA_RPC_URL` | RPC endpoint, e.g. `https://sepolia.infura.io/v3/<key>` |
| `PRIVATE_KEY` | Deployer wallet private key |
| `ETHERSCAN_API_KEY` | For automatic source verification |

### How to trigger a manual deploy

1. Go to **Actions → Deploy (manual) → Run workflow**
2. Pick the target network (`sepolia` or `hardhat`)
3. Choose whether to verify on Etherscan
4. Click **Run workflow**

## Relayer Script

```bash
# .env
CONTRACT_ADDRESS=0xYourDeployedContract
USDC_TOKEN=0xYourUsdcAddress
AMOUNT=3007580000000        # gross amount in 6-decimal units
DEADLINE=1780000000
NATIVE_TO_USDC_PRICE=3000   # approximate 1 ETH = 3000 USDC for fee calc

node scripts/relay-fixed-request.js
```

The script:
1. Estimates gas for the call and computes a sponsorship fee (15 % buffer)
2. Subtracts the fee from `AMOUNT` to get `netAmount`
3. Calls `submitRequest(usdcToken, netAmount, deadline)`
4. Parses the `RequestSubmitted` event from the receipt to derive `requestId`
5. Logs the full event payload and stored request

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

