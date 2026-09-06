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
});
