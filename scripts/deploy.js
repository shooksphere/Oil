require("dotenv").config();

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is not set");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("Entropy");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();

  console.log("Entropy deployed at:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
