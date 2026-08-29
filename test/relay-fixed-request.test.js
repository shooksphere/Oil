const { expect } = require("chai");

describe("relay-fixed-request helpers", function () {
  it("derives requestId from RequestSubmitted event logs", async function () {
    const iface = new ethers.Interface([
      "event RequestSubmitted(uint256 indexed requestId, address indexed requester, address indexed token, address spenderDelegator, address recipient, uint256 amount, bytes32 approvalTxHash, uint256 chainId, uint256 deadline, string purpose)",
    ]);

    const requestId = 7n;
    const requester = "0x000000000000000000000000000000000000dEaD";
    const token = "0x0000000000000000000000000000000000000001";
    const spenderDelegator = "0x0000000000000000000000000000000000000002";
    const recipient = "0x0000000000000000000000000000000000000003";
    const amount = 123456789n;
    const approvalTxHash = "0x6387457c5600500934253031a1356f8c61f48ed9d891da1385551cde629c1181";
    const chainId = 11155111n;
    const deadline = 1780000000n;
    const purpose = "transfer/trade with metamask eip-7702 delegator";

    const event = iface.encodeEventLog(iface.getEvent("RequestSubmitted"), [
      requestId,
      requester,
      token,
      spenderDelegator,
      recipient,
      amount,
      approvalTxHash,
      chainId,
      deadline,
      purpose,
    ]);

    const parsed = iface.parseLog({ topics: event.topics, data: event.data });

    expect(parsed.name).to.equal("RequestSubmitted");
    expect(parsed.args.requestId).to.equal(requestId);
    expect(parsed.args.requester).to.equal(requester);
    expect(parsed.args.token).to.equal(token);
    expect(parsed.args.amount).to.equal(amount);
  });
});
