require("dotenv").config();

async function main() {
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
