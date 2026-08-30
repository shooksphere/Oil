require("dotenv").config();

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is not set");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ownerAddress = process.env.OWNER_ADDRESS || "0x4b74e692a67aacff51b6f5ab57d9c6a4d27c9bb6";
  console.log("Contract owner will be:", ownerAddress);

  const Factory = await ethers.getContractFactory("Entropy");
  const contract = await Factory.deploy(ownerAddress);
  await contract.waitForDeployment();

  console.log("Entropy deployed at:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
