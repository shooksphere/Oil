# Entropy / EntropyRecord Deployment Guide

## 1) Installation

```bash
cd Oil
npm install
cp .env.example .env
```

Set at minimum:

```bash
SEPOLIA_RPC_URL=...
PRIVATE_KEY=...
OWNER_ADDRESS=0xYourOwnerAddress
```

For GitHub Actions deployments, use a dedicated low-balance sponsor/deployer wallet in `PRIVATE_KEY`; CI pays deployment gas from that wallet, not from end users.

Add this only when deploying to Ethereum mainnet:

```bash
MAINNET_RPC_URL=...
```

## 2) Compile + Deploy

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/deploy.js --network mainnet
```

Current deploy script deploys `Entropy`.  
For `EntropyRecord`, deploy from Hardhat console:

```bash
npx hardhat console --network sepolia
```

```js
const F = await ethers.getContractFactory("EntropyRecord");
const r = await F.deploy(); // no constructor args
await r.waitForDeployment();
await r.getAddress();
```

## 3) Configure Executors (Entropy only)

Only owner can allow/revoke executors.

```js
const entropy = await ethers.getContractAt("Entropy", "0xEntropyAddress");
await entropy.setExecutor("0xExecutorAddress", true);  // allow
await entropy.setExecutor("0xExecutorAddress", false); // revoke
```

`SPENDER_DELEGATOR` is always authorized by contract logic.

## 4) Call submitRequest / executeRequest / cancelRequest

### Entropy.submitRequest

```js
await entropy.connect(requester).submitRequest(
  "0xUsdcTokenAddress",
  3007580000000n,
  1789135200n // unix seconds UTC (2026-09-11 14:00:00 UTC / 10:00 AM ET)
);
```

### Entropy.executeRequest

```js
await entropy.connect(executor).executeRequest(1);
```

### Entropy.cancelRequest

```js
await entropy.connect(requester).cancelRequest(1);
```

### EntropyRecord.submitRequest

Use the target execution chain id (for mainnet: `1`, for sepolia: `11155111`).

```js
const record = await ethers.getContractAt("EntropyRecord", "0xRecordAddress");
await record.connect(requester).submitRequest(
  "0xUsdcTokenAddress",
  3007580000000n,
  11155111n
);
```

### EntropyRecord.cancelRequest

```js
await record.connect(requester).cancelRequest(1);
```

## 5) End-to-end example

1. Owner deploys `Entropy` and `EntropyRecord`.
2. Owner calls `setExecutor(executor, true)` on `Entropy`.
3. Requester calls `submitRequest` on `Entropy`.
4. Authorized executor calls `executeRequest(requestId)` on `Entropy`.
5. If needed before execution, requester calls `cancelRequest(requestId)`.

## 6) Lifecycle note

- `Entropy.submitRequest` requires a future deadline in unix seconds UTC.
- `Entropy.executeRequest` is only allowed while `block.timestamp <= deadline`; afterwards it reverts with `DeadlineExpired()`.
- `Entropy.isActive(requestId)` remains status-based only, so an expired request still reads active until it is cancelled or successfully executed.
- `EntropyRecord.isActive(requestId)` is also status-based only.
