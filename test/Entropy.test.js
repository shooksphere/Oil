const { expect } = require("chai");

describe("Entropy", function () {
  it("validates submitRequest inputs", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 3600);

    await expect(
      c.connect(requester).submitRequest(ethers.ZeroAddress, 1n, deadline)
    ).to.be.revertedWithCustomError(c, "InvalidAddress");

    await expect(
      c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 0n, deadline)
    ).to.be.revertedWithCustomError(c, "InvalidAmount");

    await expect(
      c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 1n, 0n)
    ).to.be.revertedWithCustomError(c, "InvalidDeadline");
  });

  it("submits a request", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const usdc = "0x0000000000000000000000000000000000000001";
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 24 * 60 * 60);

    await expect(c.connect(requester).submitRequest(usdc, 123456789n, deadline))
      .to.emit(c, "RequestSubmitted");

    const req = await c.requests(1);
    expect(req.requester).to.equal(requester.address);
    expect(req.token).to.equal(usdc);
    expect(req.amount).to.equal(123456789n);
    expect(req.deadline).to.equal(deadline);

    await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(true);
  });

  it("executes request before the deadline", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const T = await ethers.getContractFactory("MockUSDC");
    const token = await T.deploy();
    await token.waitForDeployment();

    const amount = 123456789n;
    const recipient = await c.RECIPIENT();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 7 * 24 * 60 * 60);

    await token.mint(requester.address, amount);
    await c.setExecutor(owner.address, true);
    await c.connect(requester).submitRequest(await token.getAddress(), amount, deadline);
    await token.connect(requester).approve(await c.getAddress(), amount);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(c.connect(owner).executeRequest(1)).to.emit(c, "RequestExecuted");
    expect(await token.balanceOf(recipient)).to.equal(amount);
  });

  it("reverts execution after the deadline passes", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const T = await ethers.getContractFactory("MockUSDC");
    const token = await T.deploy();
    await token.waitForDeployment();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 3600);

    await token.mint(requester.address, 1n);
    await token.connect(requester).approve(await c.getAddress(), 1n);
    await c.setExecutor(owner.address, true);
    await c.connect(requester).submitRequest(await token.getAddress(), 1n, deadline);

    await ethers.provider.send("evm_increaseTime", [2 * 3600]);
    await ethers.provider.send("evm_mine");

    await expect(c.connect(owner).executeRequest(1)).to.be.revertedWithCustomError(c, "DeadlineExpired");
    expect(await c.isActive(1)).to.equal(false);
  });

  it("stays inactive after cancellation even when time advances", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 7 * 24 * 60 * 60);

    await c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 1n, deadline);
    await c.connect(requester).cancelRequest(1);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(false);
  });
});
