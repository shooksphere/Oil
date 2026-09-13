const { expect } = require("chai");
const { resolveOwnerAddress, DEFAULT_MAINNET_OWNER } = require("../scripts/deploy");

describe("deploy script owner resolution", function () {
  it("defaults to configured mainnet owner on mainnet", async function () {
    const owner = resolveOwnerAddress("mainnet", {});
    expect(owner).to.equal(DEFAULT_MAINNET_OWNER);
  });

  it("prefers OWNER_ADDRESS when provided", async function () {
    const owner = resolveOwnerAddress("mainnet", {
      OWNER_ADDRESS: "0x000000000000000000000000000000000000dEaD",
    });
    expect(owner).to.equal("0x000000000000000000000000000000000000dEaD");
  });
});
