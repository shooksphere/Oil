const { expect } = require("chai");

describe("ExecutablePermitRequestUSDC", function () {
  it("submits a request", async function () {
    const [owner, requester] = await ethers.getSigners();
    const C = await ethers.getContractFactory("ExecutablePermitRequestUSDC");
    const c = await C.deploy(owner.address);
    await c.waitForDeployment();

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const usdc = "0x0000000000000000000000000000000000000001";

    await expect(c.connect(requester).submitRequest(usdc, 123456789n, deadline))
      .to.emit(c, "RequestSubmitted");

    const req = await c.requests(1);
    expect(req.requester).to.equal(requester.address);
    expect(req.token).to.equal(usdc);
    expect(req.amount).to.equal(123456789n);
  });
});
