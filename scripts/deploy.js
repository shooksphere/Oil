require("dotenv").config();
const hre = require("hardhat");

const DEFAULT_MAINNET_OWNER = "0x4F2D58cA77f6efb7154B181ca1da05E923E31fFA";
const DEFAULT_OWNER = "0x4b74e692a67aacff51b6f5ab57d9c6a4d27c9bb6";

function resolveOwnerAddress(networkName = "unknown", env = process.env) {
  if (env.OWNER_ADDRESS) return env.OWNER_ADDRESS;
  return networkName === "mainnet" ? DEFAULT_MAINNET_OWNER : DEFAULT_OWNER;
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is not set");
  }

  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();
  console.log("Deploying on network:", networkName);
  console.log("Deploying with:", deployer.address);

  const ownerAddress = resolveOwnerAddress(networkName);
  console.log("Contract owner will be:", ownerAddress);

  const Factory = await ethers.getContractFactory("Entropy");
  const contract = await Factory.deploy(ownerAddress);
  await contract.waitForDeployment();

  const entropyAddress = await contract.getAddress();
  console.log("Entropy deployed at:", entropyAddress);

  const petroAddress = process.env.PETRO_CONTRACT_ADDRESS;
  if (petroAddress) {
    const petro = await ethers.getContractAt(
      [
        "function setTargetAllowed(address target, bool allowed) external",
        "function setSelectorAllowlistEnabled(address target, bool enabled) external",
        "function setSelectorAllowed(address target, bytes4 selector, bool allowed) external",
      ],
      petroAddress
    );

    const enableSelectorAllowlist = process.env.PETRO_ENABLE_SELECTOR_ALLOWLIST === "true";
    const allowSubmitSelector = process.env.PETRO_ALLOW_SUBMIT_SELECTOR !== "false";
    const submitSelector = contract.interface.getFunction("submitRequest").selector;

    const txAllowTarget = await petro.setTargetAllowed(entropyAddress, true);
    await txAllowTarget.wait();
    console.log("Petro allowlist target set:", entropyAddress);

    const txSelectorMode = await petro.setSelectorAllowlistEnabled(entropyAddress, enableSelectorAllowlist);
    await txSelectorMode.wait();
    console.log("Petro selector allowlist enabled:", enableSelectorAllowlist);

    if (enableSelectorAllowlist && allowSubmitSelector) {
      const txAllowSelector = await petro.setSelectorAllowed(entropyAddress, submitSelector, true);
      await txAllowSelector.wait();
      console.log("Petro selector allowlisted:", submitSelector);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  resolveOwnerAddress,
  DEFAULT_MAINNET_OWNER,
};
