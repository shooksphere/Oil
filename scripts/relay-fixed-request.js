require("dotenv").config();
const hre = require("hardhat");

const CONTRACT_ABI = [
  "function submitRequest(address usdcToken, uint256 amount, uint256 deadline) returns (uint256)",
  "function requests(uint256) view returns (address requester,address spenderDelegator,address token,address recipient,uint256 amount,uint256 deadline,bytes32 approvalTxHash,uint256 chainId,string purpose,uint8 status,uint256 createdAt,uint256 executedAt)",
  "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, uint256 deadline, bytes32 approvalTxHash, uint256 chainId, string purpose)",
];

function parseUintEnv(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);

  try {
    const value = BigInt(raw);
    if (value <= 0n) throw new Error();
    return value;
  } catch (_) {
    throw new Error(`${name} must be a positive integer in base-10 string form`);
  }
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
  console.log("deadline:", deadline.toString(), "(unix seconds UTC)");

  const tx = await contract.submitRequest(usdcToken, netAmount, deadline);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
