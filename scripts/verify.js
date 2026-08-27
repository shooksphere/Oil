require("dotenv").config();
const hre = require("hardhat");

/**
 * Usage:
 *   CONTRACT_ADDRESS=0x... OWNER_ADDRESS=0x... npm run verify:sepolia
 */
async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const ownerAddress = process.env.OWNER_ADDRESS;

  if (!contractAddress) {
    throw new Error("Missing CONTRACT_ADDRESS in environment");
  }
  if (!ownerAddress) {
    throw new Error("Missing OWNER_ADDRESS in environment");
  }

  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: [ownerAddress],
  });

  console.log("Verification submitted for:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
