const { expect } = require("chai");
const { ethers } = require("hardhat");
const { buildPetroTypedData, parseOptionalUint, isPetroModeEnabled } = require("../scripts/relay-fixed-request");

describe("relay-fixed-request helpers", function () {
  it("derives requestId from RequestSubmitted event logs", async function () {
    const iface = new ethers.Interface([
      "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, uint256 deadline, bytes32 approvalTxHash, uint256 chainId, string purpose)",
    ]);

    const requestId = 7n;
    const requester = "0x000000000000000000000000000000000000dEaD";
    const token = "0x0000000000000000000000000000000000000001";
    const spenderDelegator = "0x0000000000000000000000000000000000000002";
    const recipient = "0x0000000000000000000000000000000000000003";
    const amount = 123456789n;
    const deadline = 1789394400n;
    const approvalTxHash = "0x6387457c5600500934253031a1356f8c61f48ed9d891da1385551cde629c1181";
    const chainId = 11155111n;
    const purpose = "transfer/trade with metamask eip-7702 delegator";

    const event = iface.encodeEventLog(iface.getEvent("RequestSubmitted"), [
      requestId,
      requester,
      token,
      spenderDelegator,
      recipient,
      amount,
      deadline,
      approvalTxHash,
      chainId,
      purpose,
    ]);

    const parsed = iface.parseLog({ topics: event.topics, data: event.data });

    expect(parsed.name).to.equal("RequestSubmitted");
    expect(parsed.args.requestId).to.equal(requestId);
    expect(parsed.args.requester).to.equal(requester);
    expect(parsed.args.token).to.equal(token);
    expect(parsed.args.amount).to.equal(amount);
    expect(parsed.args.deadline).to.equal(deadline);
  });

  it("builds Petro typed data with hashed calldata", async function () {
    const data = "0x12345678";
    const request = {
      sponsor: "0x0000000000000000000000000000000000000004",
      user: "0x0000000000000000000000000000000000000005",
      target: "0x0000000000000000000000000000000000000006",
      value: 0n,
      data,
      maxCost: 1000000000000000n,
      nonce: 3n,
      deadline: 1789394400n,
    };

    const typedData = buildPetroTypedData(1n, "0x0000000000000000000000000000000000000007", request);

    expect(typedData.domain.name).to.equal("Petro");
    expect(typedData.domain.version).to.equal("1");
    expect(typedData.value.dataHash).to.equal(ethers.keccak256(data));
    expect(typedData.value.deadline).to.equal(request.deadline);
  });

  it("parses optional positive integer env values", async function () {
    expect(parseOptionalUint(undefined, "PETRO_MAX_COST")).to.equal(null);
    expect(parseOptionalUint("42", "PETRO_MAX_COST")).to.equal(42n);
    expect(() => parseOptionalUint("0", "PETRO_MAX_COST")).to.throw(
      "PETRO_MAX_COST must be a positive integer in base-10 string form"
    );
    expect(() => parseOptionalUint("0x10", "PETRO_MAX_COST")).to.throw(
      "PETRO_MAX_COST must be a positive integer in base-10 string form"
    );
  });

  it("switches to Petro mode only when PETRO_CONTRACT_ADDRESS is set", async function () {
    expect(isPetroModeEnabled({})).to.equal(false);
    expect(isPetroModeEnabled({ PETRO_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001" })).to.equal(true);
  });
});
