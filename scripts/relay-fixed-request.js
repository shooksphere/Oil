require("dotenv").config();
const hre = require("hardhat");

const CONTRACT_ABI = [
  "function submitRequest(address usdcToken, uint256 amount, uint256 deadline) returns (uint256)",
  "function requests(uint256) view returns (address requester,address spenderDelegator,address token,address recipient,uint256 amount,bytes32 approvalTxHash,uint256 chainId,uint256 deadline,string purpose,uint8 status,uint256 createdAt,uint256 executedAt)",
  "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, bytes32 approvalTxHash, uint256 chainId, uint256 deadline, string purpose)",
];

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const usdcToken = process.env.USDC_TOKEN;
  const deadline = BigInt(process.env.DEADLINE || "0");
  const grossAmount = BigInt(process.env.AMOUNT || "0");

  if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
  if (!usdcToken) throw new Error("Missing USDC_TOKEN");
  if (!deadline) throw new Error("Missing DEADLINE");
  if (!grossAmount) throw new Error("Missing AMOUNT");

  const [signer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(contractAddress, CONTRACT_ABI, signer);

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
    approvalTxHash: eventPayload.approvalTxHash,
    chainId: eventPayload.chainId.toString(),
    deadline: eventPayload.deadline.toString(),
    purpose: eventPayload.purpose,
  });

  const req = await contract.requests(requestId);
  console.log("stored amount:", req.amount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
