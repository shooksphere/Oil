const { expect } = require("chai");

describe("Entropy", function () {
  it("validates submitRequest inputs", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    await expect(
      c.connect(requester).submitRequest(ethers.ZeroAddress, 1n)
    ).to.be.revertedWithCustomError(c, "InvalidAddress");

    await expect(
      c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 0n)
    ).to.be.revertedWithCustomError(c, "InvalidAmount");
  });

  it("submits a request", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const usdc = "0x0000000000000000000000000000000000000001";

    await expect(c.connect(requester).submitRequest(usdc, 123456789n))
      .to.emit(c, "RequestSubmitted");

    const req = await c.requests(1);
    expect(req.requester).to.equal(requester.address);
    expect(req.token).to.equal(usdc);
    expect(req.amount).to.equal(123456789n);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(true);
  });

  it("executes request after time passes without deadline checks", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const T = await ethers.getContractFactory("MockUSDC");
    const token = await T.deploy();
    await token.waitForDeployment();

    const amount = 123456789n;
    const recipient = await c.RECIPIENT();

    await token.mint(requester.address, amount);
    await c.setExecutor(owner.address, true);
    await c.connect(requester).submitRequest(await token.getAddress(), amount);
    await token.connect(requester).approve(await c.getAddress(), amount);

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    await expect(c.connect(owner).executeRequest(1)).to.emit(c, "RequestExecuted");
    expect(await token.balanceOf(recipient)).to.equal(amount);
  });

  it("stays inactive after cancellation even when time advances", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("Entropy");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    await c.connect(requester).submitRequest("0x0000000000000000000000000000000000000001", 1n);
    await c.connect(requester).cancelRequest(1);

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    expect(await c.isActive(1)).to.equal(false);
  });
});
