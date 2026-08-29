require("dotenv").config();
const hre = require("hardhat");

const CONTRACT_ABI = [
  "function submitRequest(address usdcToken, uint256 deadline) returns (uint256)",
  "function requests(uint256) view returns (address requester,address spenderDelegator,address token,address recipient,uint256 amount,bytes32 approvalTxHash,uint256 chainId,uint256 deadline,string purpose,uint8 status,uint256 createdAt,uint256 executedAt)",
  "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, bytes32 approvalTxHash, uint256 chainId, uint256 deadline, string purpose)",
];

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const usdcToken = process.env.USDC_TOKEN;
  const deadline = BigInt(process.env.DEADLINE || "0");

  if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
  if (!usdcToken) throw new Error("Missing USDC_TOKEN");
  if (!deadline) throw new Error("Missing DEADLINE");

  const [signer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(contractAddress, CONTRACT_ABI, signer);

  const estimatedGas = await contract.submitRequest.estimateGas(usdcToken, deadline);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!gasPrice) throw new Error("Unable to determine gas price");

  const bufferedGas = (estimatedGas * 115n) / 100n;
  const gasCostNative = bufferedGas * gasPrice;

  const NATIVE_TO_USDC_PRICE = BigInt(process.env.NATIVE_TO_USDC_PRICE || "3000");
  const gasCostUsdc = (gasCostNative * NATIVE_TO_USDC_PRICE) / 10n ** 18n;

  const fixedAmount = 3007580n * 10n ** 6n;
  const netEconomicAmount = gasCostUsdc >= fixedAmount ? 0n : fixedAmount - gasCostUsdc;

  console.log("estimatedGas:", estimatedGas.toString());
  console.log("bufferedGas:", bufferedGas.toString());
  console.log("gasCostNative:", gasCostNative.toString());
  console.log("gasCostUsdc:", gasCostUsdc.toString());
  console.log("fixedAmount:", fixedAmount.toString());
  console.log("netEconomicAmount:", netEconomicAmount.toString());

  const tx = await contract.submitRequest(usdcToken, deadline);
  console.log("tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("mined in block:", receipt.blockNumber);

  const iface = new hre.ethers.Interface(CONTRACT_ABI);
  let requestId = null;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "RequestSubmitted") {
        requestId = parsed.args.requestId;
        break;
      }
    } catch (_) {
      // ignore unrelated logs
    }
  }

  if (requestId === null) {
    throw new Error("RequestSubmitted event not found in receipt logs");
  }

  console.log("requestId:", requestId.toString());

  const req = await contract.requests(requestId);
  console.log("stored amount:", req.amount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
