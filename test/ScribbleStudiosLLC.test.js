const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ScribbleStudiosLLC", function () {
  const CONTRACT_OWNER = "0x2fb9c602fbA553313443e8B5F090E53D25eb8c3C";
  const SPENDER_DELEGATOR = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
  const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const SIX_DECIMALS = 1_000_000n;
  const THIRTY_DAYS = 30n * 24n * 60n * 60n;
  const ONE_YEAR = 365n * 24n * 60n * 60n;

  async function impersonate(address) {
    await ethers.provider.send("hardhat_setBalance", [address, "0x3635C9ADC5DEA00000"]);
    return ethers.getImpersonatedSigner(address);
  }

  async function setCanonicalUsdcCode() {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const implementation = await MockUSDC.deploy();
    await implementation.waitForDeployment();
    const code = await ethers.provider.getCode(await implementation.getAddress());
    await ethers.provider.send("hardhat_setCode", [USDC_ADDRESS, code]);
    return ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  }

  function splitStandard(amount) {
    const circle = (amount * 800n) / 10_000n;
    return { studio: amount - circle, circle };
  }

  async function deployFixture(circleWallet = ethers.ZeroAddress) {
    const usdc = await setCanonicalUsdcCode();
    const owner = await impersonate(CONTRACT_OWNER);
    const delegator = await impersonate(SPENDER_DELEGATOR);
    const [, member, memberTwo, artistOne, artistTwo, payer, circle] = await ethers.getSigners();

    const ScribbleStudiosLLC = await ethers.getContractFactory("ScribbleStudiosLLC");
    const contract = await ScribbleStudiosLLC.deploy(circleWallet);
    await contract.waitForDeployment();

    return {
      contract,
      usdc,
      owner,
      delegator,
      member,
      memberTwo,
      artistOne,
      artistTwo,
      payer,
      circle,
    };
  }

  beforeEach(async function () {
    await ethers.provider.send("hardhat_reset");
  });

  it("enrolls memberships, accrues Circle's share until the wallet is set, and supports delegated renewal", async function () {
    const { contract, usdc, owner, delegator, member, circle } = await deployFixture();
    const monthlyPrice = 299n * SIX_DECIMALS;
    const annualPrice = 3_288n * SIX_DECIMALS;

    await contract.connect(owner).configureMembershipTier(0, "Premium", monthlyPrice, annualPrice, true);
    await usdc.mint(member.address, annualPrice);
    await usdc.connect(member).approve(await contract.getAddress(), annualPrice);

    await contract.connect(member).enrollMembership(1, 0, true);

    const { studio, circle: circleShare } = splitStandard(monthlyPrice);
    const firstPaidUntil = (await contract.members(member.address)).paidUntil;
    expect(await usdc.balanceOf(CONTRACT_OWNER)).to.equal(studio);
    expect(await contract.accruedCircleBalance()).to.equal(circleShare);
    expect(await contract.isMemberVerified(member.address)).to.equal(true);

    await contract.connect(owner).setCircleWallet(circle.address);
    await contract.connect(owner).sweepAccruedCircleBalance();
    expect(await usdc.balanceOf(circle.address)).to.equal(circleShare);
    expect(await contract.accruedCircleBalance()).to.equal(0n);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(firstPaidUntil + 1n)]);
    await ethers.provider.send("evm_mine");

    await contract.connect(delegator).collectRecurringMembership(member.address);

    const record = await contract.members(member.address);
    expect(record.paidUntil).to.be.gte(firstPaidUntil + THIRTY_DAYS + 1n);
    expect(record.paidUntil).to.be.lte(firstPaidUntil + THIRTY_DAYS + 2n);
    expect(await usdc.balanceOf(circle.address)).to.equal(circleShare * 2n);
  });

  it("tracks artist progression, quarterly reviews, and milestone governance", async function () {
    const { contract, usdc, owner, member, artistOne } = await deployFixture();
    const monthlyPrice = 199n * SIX_DECIMALS;

    await contract.connect(owner).configureMembershipTier(0, "Creator", monthlyPrice, 2_000n * SIX_DECIMALS, true);

    await usdc.mint(artistOne.address, monthlyPrice);
    await usdc.connect(artistOne).approve(await contract.getAddress(), monthlyPrice);
    await contract.connect(artistOne).enrollMembership(1, 0, false);

    await usdc.mint(member.address, monthlyPrice);
    await usdc.connect(member).approve(await contract.getAddress(), monthlyPrice);
    await contract.connect(member).enrollMembership(1, 0, false);

    await contract.connect(artistOne).applyAsArtist("ipfs://artist-one");
    await contract.connect(owner).approveArtistMember(artistOne.address, "ipfs://artist-one/member");

    const rosterProposalTx = await contract
      .connect(member)
      .submitProposal(0, artistOne.address, 0, ONE_YEAR, true, 24 * 60 * 60, "Roster", "Promote artist to roster");
    const rosterReceipt = await rosterProposalTx.wait();
    const rosterEvent = rosterReceipt.logs.find((log) => log.fragment?.name === "ProposalSubmitted");

    await contract.connect(member).castVote(rosterEvent.args.proposalId, true);
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await contract.connect(owner).executeProposal(rosterEvent.args.proposalId);

    const artistProfile = await contract.artists(artistOne.address);
    expect(artistProfile.status).to.equal(3n);
    expect(artistProfile.sponsored).to.equal(true);
    expect(artistProfile.brandingRequired).to.equal(true);
    expect(artistProfile.rosterEndsAt - artistProfile.rosterStartedAt).to.equal(ONE_YEAR);

    await contract.connect(owner).recordQuarterlyReview(artistOne.address, 1, 1, "Onboarding completed");
    const review = await contract.quarterlyReviews(artistOne.address, 1);
    expect(review.quarterNumber).to.equal(1n);
    expect(review.stage).to.equal(1n);

    const milestoneTx = await contract.connect(owner).createMilestone(1, 2, "A&R meeting booked");
    const milestoneReceipt = await milestoneTx.wait();
    const milestoneEvent = milestoneReceipt.logs.find((log) => log.fragment?.name === "MilestoneCreated");

    const milestoneProposalTx = await contract
      .connect(member)
      .submitProposal(3, ethers.ZeroAddress, milestoneEvent.args.milestoneId, 0, false, 24 * 60 * 60, "Milestone", "Approve A&R milestone");
    const milestoneProposalReceipt = await milestoneProposalTx.wait();
    const proposalEvent = milestoneProposalReceipt.logs.find((log) => log.fragment?.name === "ProposalSubmitted");

    await contract.connect(member).castVote(proposalEvent.args.proposalId, true);
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await contract.connect(owner).executeProposal(proposalEvent.args.proposalId);

    const milestone = await contract.milestones(milestoneEvent.args.milestoneId);
    expect(milestone.completed).to.equal(true);
  });

  it("approves showcases by proposal and distributes revenue using the 8/92 and 60/40 rules", async function () {
    const { contract, usdc, owner, member, artistOne, artistTwo, payer, circle } = await deployFixture();
    const membershipPrice = 149n * SIX_DECIMALS;
    const showcaseGross = 1_000n * SIX_DECIMALS;

    await contract.connect(owner).configureMembershipTier(0, "Basic", membershipPrice, 1_500n * SIX_DECIMALS, true);
    await contract.connect(owner).setCircleWallet(circle.address);

    await usdc.mint(member.address, membershipPrice);
    await usdc.connect(member).approve(await contract.getAddress(), membershipPrice);
    await contract.connect(member).enrollMembership(1, 0, false);

    const showcaseTx = await contract
      .connect(owner)
      .createShowcase("Tri-State Festival", 10, 20, [artistOne.address, artistTwo.address], [5_000, 5_000]);
    const showcaseReceipt = await showcaseTx.wait();
    const showcaseEvent = showcaseReceipt.logs.find((log) => log.fragment?.name === "ShowcaseCreated");

    const proposalTx = await contract
      .connect(member)
      .submitProposal(1, ethers.ZeroAddress, showcaseEvent.args.showcaseId, 0, false, 24 * 60 * 60, "Approve showcase", "Approve annual festival");
    const proposalReceipt = await proposalTx.wait();
    const proposalEvent = proposalReceipt.logs.find((log) => log.fragment?.name === "ProposalSubmitted");

    await contract.connect(member).castVote(proposalEvent.args.proposalId, true);
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await contract.connect(owner).executeProposal(proposalEvent.args.proposalId);

    await usdc.mint(payer.address, showcaseGross);
    await usdc.connect(payer).approve(await contract.getAddress(), showcaseGross);
    await contract.connect(payer).recordShowcaseRevenue(showcaseEvent.args.showcaseId, showcaseGross, "Annual showcase");

    const circleShare = (showcaseGross * 800n) / 10_000n;
    const remaining = showcaseGross - circleShare;
    const studioShare = (remaining * 6_000n) / 10_000n;
    const artistPool = remaining - studioShare;
    const membershipCircleShare = splitStandard(membershipPrice).circle;

    expect(await usdc.balanceOf(circle.address)).to.equal(membershipCircleShare + circleShare);
    expect(await usdc.balanceOf(CONTRACT_OWNER)).to.equal(splitStandard(membershipPrice).studio + studioShare);
    expect(await usdc.balanceOf(artistOne.address)).to.equal(artistPool / 2n);
    expect(await usdc.balanceOf(artistTwo.address)).to.equal(artistPool / 2n);
  });

  it("tracks standard revenue streams and investment repayments against the recorded schedule", async function () {
    const { contract, usdc, owner, payer, circle } = await deployFixture();
    const apparelRevenue = 500n * SIX_DECIMALS;
    const firstInstallment = 20_000_000n * SIX_DECIMALS;

    await contract.connect(owner).setCircleWallet(circle.address);

    await usdc.mint(payer.address, apparelRevenue);
    await usdc.connect(payer).approve(await contract.getAddress(), apparelRevenue);
    await contract.connect(payer).recordRevenue(1, apparelRevenue, "Apparel drop");

    const apparelSplit = splitStandard(apparelRevenue);
    const apparelLedger = await contract.revenueByStream(1);
    expect(apparelLedger.gross).to.equal(apparelRevenue);
    expect(apparelLedger.studioShare).to.equal(apparelSplit.studio);
    expect(apparelLedger.circleShare).to.equal(apparelSplit.circle);

    await usdc.mint(CONTRACT_OWNER, firstInstallment);
    await usdc.connect(owner).approve(await contract.getAddress(), firstInstallment);
    await contract.connect(owner).recordInvestmentRepayment(1, 3, firstInstallment, "Memberships, apparel, events, tech");

    const installmentOne = await contract.investmentInstallments(1);
    const installmentSix = await contract.investmentInstallments(6);
    expect(await contract.TOTAL_USDC_AMOUNT()).to.equal(271_300_000n * SIX_DECIMALS);
    expect(await contract.INVESTMENT_PRINCIPAL()).to.equal(100_000_000n * SIX_DECIMALS);
    expect(await contract.INVESTMENT_TOTAL_REPAYMENT()).to.equal(120_000_000n * SIX_DECIMALS);
    expect(await contract.INVESTMENT_INSTALLMENT_COUNT()).to.equal(6n);
    expect(installmentOne.amount).to.equal(firstInstallment);
    expect(installmentOne.paidAmount).to.equal(firstInstallment);
    expect(installmentSix.amount).to.equal(firstInstallment);
    expect(installmentSix.paidAmount).to.equal(0n);
    expect(installmentSix.dueAt - installmentOne.dueAt).to.equal(150n * 24n * 60n * 60n * 5n);
    expect(await contract.totalInvestmentRepaid()).to.equal(firstInstallment);
    expect(await contract.outstandingInvestmentBalance()).to.equal(100_000_000n * SIX_DECIMALS);
    expect(await usdc.balanceOf(circle.address)).to.equal(apparelSplit.circle + firstInstallment);
  });
});
