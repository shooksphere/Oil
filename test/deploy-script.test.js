const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  resolveOwnerAddress,
  resolvePetroSelectorConfig,
  resolvePetroSigner,
  DEFAULT_MAINNET_OWNER,
  DEFAULT_OWNER,
} = require("../scripts/deploy");

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

  it("uses legacy default owner outside mainnet when OWNER_ADDRESS is unset", async function () {
    const owner = resolveOwnerAddress("sepolia", {});
    expect(owner).to.equal(DEFAULT_OWNER);
  });

  it("derives Petro selector toggles from env", async function () {
    expect(resolvePetroSelectorConfig({})).to.deep.equal({
      enableSelectorAllowlist: false,
      allowSubmitSelector: true,
    });
    expect(
      resolvePetroSelectorConfig({
        PETRO_ENABLE_SELECTOR_ALLOWLIST: "true",
        PETRO_ALLOW_SUBMIT_SELECTOR: "false",
      })
    ).to.deep.equal({
      enableSelectorAllowlist: true,
      allowSubmitSelector: false,
    });
  });

  it("uses PETRO_ADMIN_PRIVATE_KEY when provided", async function () {
    const deployer = { marker: "deployer" };
    const signer = resolvePetroSigner(deployer, {
      PETRO_ADMIN_PRIVATE_KEY: "0x0123456789012345678901234567890123456789012345678901234567890123",
    });
    expect(await signer.getAddress()).to.equal("0x14791697260E4c9A71f18484C9f997B308e59325");
  });

  it("uses the deployer provider for the Petro signer when available", async function () {
    const deployer = { provider: ethers.provider };
    const signer = resolvePetroSigner(deployer, {
      PETRO_ADMIN_PRIVATE_KEY: "0x0123456789012345678901234567890123456789012345678901234567890123",
    });

    expect(signer.provider).to.equal(ethers.provider);
  });

  it("falls back to deployer for Petro signer when no admin key", async function () {
    const deployer = { marker: "deployer" };
    expect(resolvePetroSigner(deployer, {})).to.equal(deployer);
  });
});
