# Oil

Private Solidity workspace for permit-style USDC transfer request flows.

## Included Contracts

- `contracts/Entropy.sol`  
  One-time executable USDC request contract with deadline-enforced execution.
- `contracts/PermitRequestUSDC.sol`  
  Request-record contract only (stores and emits request data).
- `contracts/ExecutablePermitRequestUSDC.sol`  
  One-time executable request contract that can call `transferFrom` after allowance is set.

## Contract API

### `Entropy.submitRequest`
```solidity
function submitRequest(
    address usdcToken,
    uint256 amount,   // token amount in 6-decimal USDC units (must be > 0)
    uint256 deadline  // unix timestamp in seconds (UTC), must be > block.timestamp
) external returns (uint256 requestId)
```

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
`Entropy.submitRequest` also reverts with `InvalidDeadline()` when `deadline <= block.timestamp`,
and `executeRequest` reverts with `DeadlineExpired()` after the stored deadline.

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
| **Sponsored Deploy to Sepolia (auto)** | Push to `main` that touches `contracts/`, `scripts/deploy.js`, or `scripts/verify.js` | Runs compile + tests, then deploys with the CI sponsor wallet and optionally verifies on Etherscan |
| **Deploy (manual)** | Manual trigger via GitHub UI | Deploy to any supported network on demand |

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `SEPOLIA_RPC_URL` | RPC endpoint, e.g. `https://sepolia.infura.io/v3/<key>` |
| `PRIVATE_KEY` | Dedicated low-balance deployer/sponsor wallet private key used by CI to pay deployment gas |
| `ETHERSCAN_API_KEY` | For automatic source verification |

Deployments are sponsored in CI: gas is paid by the dedicated deployer key stored in GitHub Actions secrets, not by end users.

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
DEADLINE=1789135200         # unix seconds UTC (2026-09-11 14:00:00 UTC / 10:00 AM ET)
NATIVE_TO_USDC_PRICE=3000   # approximate 1 ETH = 3000 USDC for fee calc

node scripts/relay-fixed-request.js
```

The script:
1. Estimates gas for the call and computes a sponsorship fee (15 % buffer)
2. Subtracts the fee from `AMOUNT` to get `netAmount`
3. Verifies `DEADLINE` is a future unix-seconds UTC timestamp relative to the latest block
4. Calls `submitRequest(usdcToken, netAmount, deadline)`
5. Parses the `RequestSubmitted` event from the receipt to derive `requestId`
6. Logs the full event payload and stored request

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
- `Entropy` request deadlines are unix timestamps in seconds, interpreted in UTC.
- `ExecutablePermitRequestUSDC` requires allowance to the deployed contract before execution.
- This repository is a template and does not implement full EIP-7702 logic.
