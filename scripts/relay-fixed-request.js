require("dotenv").config();
const hre = require("hardhat");

const CONTRACT_ABI = [
  "function submitRequest(address usdcToken, uint256 amount, uint256 deadline) returns (uint256)",
  "function requests(uint256) view returns (address requester,address spenderDelegator,address token,address recipient,uint256 amount,uint256 deadline,bytes32 approvalTxHash,uint256 chainId,string purpose,uint8 status,uint256 createdAt,uint256 executedAt)",
  "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, uint256 deadline, bytes32 approvalTxHash, uint256 chainId, string purpose)",
];

const PETRO_ABI = [
  "function executeSponsoredCall((address sponsor,address user,address target,uint256 value,bytes data,uint256 maxCost,uint256 nonce,uint256 deadline) request, bytes signature) returns (bytes)",
  "function nonces(address sponsor) view returns (uint256)",
];

const PETRO_SPONSORED_CALL_TYPES = {
  SponsoredCall: [
    { name: "sponsor", type: "address" },
    { name: "user", type: "address" },
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "dataHash", type: "bytes32" },
    { name: "maxCost", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

function parseUintEnv(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer in base-10 string form`);
  }

  try {
    const value = BigInt(raw);
    if (value <= 0n) throw new Error();
    return value;
  } catch (_) {
    throw new Error(`${name} must be a positive integer in base-10 string form`);
  }
}

function parseOptionalUintEnv(name) {
  return parseOptionalUint(process.env[name], name);
}

function parseOptionalUint(raw, name) {
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer in base-10 string form`);
  }
  try {
    const value = BigInt(raw);
    if (value <= 0n) throw new Error();
    return value;
  } catch (_) {
    throw new Error(`${name} must be a positive integer in base-10 string form`);
  }
}

function toUtcIsoString(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

function buildPetroTypedData(chainId, petroAddress, request) {
  return {
    domain: {
      name: "Petro",
      version: "1",
      chainId,
      verifyingContract: petroAddress,
    },
    types: PETRO_SPONSORED_CALL_TYPES,
    value: {
      sponsor: request.sponsor,
      user: request.user,
      target: request.target,
      value: request.value,
      dataHash: hre.ethers.keccak256(request.data),
      maxCost: request.maxCost,
      nonce: request.nonce,
      deadline: request.deadline,
    },
  };
}

function isPetroModeEnabled(env = process.env) {
  return Boolean(env.PETRO_CONTRACT_ADDRESS);
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const usdcToken = process.env.USDC_TOKEN;
  const grossAmount = parseUintEnv("AMOUNT");
  const deadline = parseUintEnv("DEADLINE");

  if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
  if (!usdcToken) throw new Error("Missing USDC_TOKEN");

  const [signer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(contractAddress, CONTRACT_ABI, signer);
  const latestBlock = await provider.getBlock("latest");
  const network = await provider.getNetwork();

  if (!latestBlock) throw new Error("Unable to determine latest block");
  if (deadline <= BigInt(latestBlock.timestamp)) {
    throw new Error(`DEADLINE must be greater than latest block timestamp (${latestBlock.timestamp})`);
  }

  // Estimate gas using grossAmount as a safe upper bound.
  // EVM gas for a uint256 SSTORE is value-independent, so the estimate
  // is accurate for the netAmount call that follows.
  const estimatedGas = await contract.submitRequest.estimateGas(usdcToken, grossAmount, deadline);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!gasPrice) throw new Error("Unable to determine gas price");

  const bufferedGas = (estimatedGas * 115n) / 100n;
  const gasCostNative = bufferedGas * gasPrice;

  const NATIVE_TO_USDC_PRICE = BigInt(process.env.NATIVE_TO_USDC_PRICE || "3000");
  const gasCostUsdc = (gasCostNative * NATIVE_TO_USDC_PRICE) / 10n ** 18n;

  if (gasCostUsdc >= grossAmount) throw new Error("Gas sponsorship fee exceeds or equals gross amount");
  const netAmount = grossAmount - gasCostUsdc;

  console.log("estimatedGas:", estimatedGas.toString());
  console.log("bufferedGas:", bufferedGas.toString());
  console.log("gasCostNative:", gasCostNative.toString());
  console.log("gasCostUsdc:", gasCostUsdc.toString());
  console.log("grossAmount:", grossAmount.toString());
  console.log("netAmount:", netAmount.toString());
  console.log("deadline:", deadline.toString());
  console.log("deadlineUtc:", toUtcIsoString(deadline));

  const petroAddress = process.env.PETRO_CONTRACT_ADDRESS;
  const petroMaxCost = parseOptionalUintEnv("PETRO_MAX_COST");
  const petroCallDeadline = parseOptionalUintEnv("PETRO_CALL_DEADLINE");
  let tx;

  if (isPetroModeEnabled()) {
    if (!process.env.PETRO_SPONSOR_PRIVATE_KEY) {
      throw new Error("Missing PETRO_SPONSOR_PRIVATE_KEY");
    }
    if (!petroMaxCost) throw new Error("Missing PETRO_MAX_COST");
    if (!petroCallDeadline) throw new Error("Missing PETRO_CALL_DEADLINE");
    if (petroCallDeadline <= BigInt(latestBlock.timestamp)) {
      throw new Error(`PETRO_CALL_DEADLINE must be greater than latest block timestamp (${latestBlock.timestamp})`);
    }

    const sponsorWallet = new hre.ethers.Wallet(process.env.PETRO_SPONSOR_PRIVATE_KEY, provider);
    const executorWallet = process.env.PETRO_EXECUTOR_PRIVATE_KEY
      ? new hre.ethers.Wallet(process.env.PETRO_EXECUTOR_PRIVATE_KEY, provider)
      : signer;
    const petro = new hre.ethers.Contract(petroAddress, PETRO_ABI, executorWallet);
    const sponsor = sponsorWallet.address;
    const user = process.env.PETRO_USER || signer.address;
    const nonce = await petro.nonces(sponsor);
    const calldata = contract.interface.encodeFunctionData("submitRequest", [usdcToken, netAmount, deadline]);

    const request = {
      sponsor,
      user,
      target: contractAddress,
      value: 0n,
      data: calldata,
      maxCost: petroMaxCost,
      nonce,
      deadline: petroCallDeadline,
    };

    const typedData = buildPetroTypedData(network.chainId, petroAddress, request);
    const signature = await sponsorWallet.signTypedData(typedData.domain, typedData.types, typedData.value);

    tx = await petro.executeSponsoredCall(request, signature);
    console.log("using Petro sponsor:", sponsor);
    console.log("using Petro executor:", await executorWallet.getAddress());
    console.log("Petro maxCost:", petroMaxCost.toString());
    console.log("Petro call deadline:", petroCallDeadline.toString(), "(unix seconds UTC)");
    console.log("Petro call deadlineUtc:", toUtcIsoString(petroCallDeadline));
  } else {
    tx = await contract.submitRequest(usdcToken, netAmount, deadline);
  }
  console.log("tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("mined in block:", receipt.blockNumber);

  const iface = new hre.ethers.Interface(CONTRACT_ABI);
  let requestId = null;
  let eventPayload = null;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "RequestSubmitted") {
        requestId = parsed.args.requestId;
        eventPayload = parsed.args;
        break;
      }
    } catch (_) {
      // ignore unrelated logs
    }
  }

  if (requestId === null || !eventPayload) {
    throw new Error("RequestSubmitted event not found in receipt logs");
  }

  console.log("requestId:", requestId.toString());
  console.log("event:", {
    requestId: eventPayload.requestId.toString(),
    requester: eventPayload.requester,
    token: eventPayload.token,
    spenderDelegator: eventPayload.spenderDelegator,
    recipient: eventPayload.recipient,
    amount: eventPayload.amount.toString(),
    deadline: eventPayload.deadline.toString(),
    approvalTxHash: eventPayload.approvalTxHash,
    chainId: eventPayload.chainId.toString(),
    purpose: eventPayload.purpose,
  });

  const req = await contract.requests(requestId);
  console.log("stored amount:", req.amount.toString());
  console.log("stored deadline:", req.deadline.toString());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPetroTypedData,
  parseOptionalUint,
  isPetroModeEnabled,
};
