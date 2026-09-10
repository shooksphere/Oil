const { expect } = require("chai");

describe("Entropy", function () {
  async function futureDeadline(offset = 3600n) {
    const { timestamp } = await ethers.provider.getBlock("latest");
    return BigInt(timestamp) + offset;
  }

  it("validates submitRequest inputs", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();
    const deadline = await futureDeadline();

    await expect(
      c.connect(requester).submitRequest(ethers.ZeroAddress, 1n, deadline)
    ).to.be.revertedWithCustomError(c, "InvalidAddress");

    await expect(
      c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 0n, deadline)
    ).to.be.revertedWithCustomError(c, "InvalidAmount");
  });

  it("reverts when deadline is not in the future", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const { timestamp } = await ethers.provider.getBlock("latest");
    const usdc = "0x0000000000000000000000000000000000000001";

    await expect(
      c.connect(requester).submitRequest(usdc, 1n, BigInt(timestamp))
    ).to.be.revertedWithCustomError(c, "InvalidDeadline");
  });

  it("submits a request and stores the deadline", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const usdc = "0x0000000000000000000000000000000000000001";
    const deadline = await futureDeadline(24n * 60n * 60n);

    await expect(c.connect(requester).submitRequest(usdc, 123456789n, deadline))
      .to.emit(c, "RequestSubmitted");

    const req = await c.requests(1);
    expect(req.requester).to.equal(requester.address);
    expect(req.token).to.equal(usdc);
    expect(req.amount).to.equal(123456789n);
    expect(req.deadline).to.equal(deadline);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(true);
  });

  it("executes request before its deadline when authorized", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const T = await ethers.getContractFactory("MockUSDC");
    const token = await T.deploy();
    await token.waitForDeployment();

    const amount = 123456789n;
    const recipient = await c.RECIPIENT();
    const deadline = await futureDeadline(7n * 24n * 60n * 60n);

    await token.mint(requester.address, amount);
    await c.setExecutor(owner.address, true);
    await c.connect(requester).submitRequest(await token.getAddress(), amount, deadline);
    await token.connect(requester).approve(await c.getAddress(), amount);

    await expect(c.connect(owner).executeRequest(1)).to.emit(c, "RequestExecuted");
    expect(await token.balanceOf(recipient)).to.equal(amount);
  });

  it("reverts execution after the deadline expires", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const T = await ethers.getContractFactory("MockUSDC");
    const token = await T.deploy();
    await token.waitForDeployment();

    const amount = 123456789n;
    const deadline = await futureDeadline(60n);

    await token.mint(requester.address, amount);
    await c.setExecutor(owner.address, true);
    await c.connect(requester).submitRequest(await token.getAddress(), amount, deadline);
    await token.connect(requester).approve(await c.getAddress(), amount);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline + 1n)]);
    await ethers.provider.send("evm_mine");

    await expect(c.connect(owner).executeRequest(1)).to.be.revertedWithCustomError(c, "DeadlineExpired");
    expect(await c.isActive(1)).to.equal(true);
  });

  it("stays inactive after cancellation even when time advances", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();
    const deadline = await futureDeadline();

    await c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 1n, deadline);
    await c.connect(requester).cancelRequest(1);

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(false);
  });
});
