// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ScribbleStudiosLLC
 * @notice Core operating contract for "Scribble Studios LLC"
 * @dev "The way looks strange to those who don't know it"
 */
contract ScribbleStudiosLLC is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum BillingCadence {
        Monthly,
        Annual
    }

    enum RevenueStream {
        Membership,
        Apparel,
        Event,
        Tech
    }

    enum MemberStanding {
        None,
        Active,
        Expired,
        Suspended
    }

    enum ArtistStatus {
        None,
        Applicant,
        Member,
        Roster,
        Alumni
    }

    enum QuarterStage {
        None,
        Onboarding,
        ARMeeting,
        Festival,
        Graduation
    }

    enum ProposalType {
        ArtistRoster,
        ShowcaseApproval,
        MajorDecision,
        Milestone
    }

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant CIRCLE_BPS = 800;
    uint16 public constant STUDIO_BPS = 9_200;
    uint16 public constant SHOWCASE_STUDIO_BPS = 6_000;
    uint16 public constant SHOWCASE_ARTIST_BPS = 4_000;
    uint256 public constant MIN_ROSTER_TERM = 365 days;
    uint256 public constant MAX_ROSTER_TERM = 730 days;
    uint256 public constant TOTAL_USDC_AMOUNT = 271_300_000 * 1e6;
    uint256 public constant INVESTMENT_PRINCIPAL = 100_000_000 * 1e6;
    uint256 public constant INVESTMENT_TOTAL_REPAYMENT = 120_000_000 * 1e6;
    uint8 public constant INVESTMENT_INSTALLMENT_COUNT = 6;
    uint256 public constant INVESTMENT_INSTALLMENT_AMOUNT = 20_000_000 * 1e6;
    uint256 public constant INVESTMENT_PAYMENT_INTERVAL = 150 days;
    address public constant CONTRACT_OWNER = 0x2fb9c602fbA553313443e8B5F090E53D25eb8c3C;
    address public constant SPENDER_DELEGATOR = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    address public constant PRIMARY_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    struct MembershipTier {
        string name;
        uint256 monthlyPrice;
        uint256 annualPrice;
        bool active;
    }

    struct MemberRecord {
        uint256 tierId;
        BillingCadence cadence;
        uint64 paidUntil;
        bool autoRenew;
        bool suspended;
        uint256 totalPaid;
    }

    struct ArtistProfile {
        ArtistStatus status;
        bool sponsored;
        bool brandingRequired;
        uint64 rosterStartedAt;
        uint64 rosterEndsAt;
        uint256 quarterlyReviewCount;
        string metadataURI;
    }

    struct QuarterlyReview {
        uint256 quarterNumber;
        QuarterStage stage;
        uint64 reviewedAt;
        string notes;
    }

    struct RevenueLedger {
        uint256 gross;
        uint256 studioShare;
        uint256 circleShare;
        uint256 artistShare;
    }

    struct Showcase {
        string name;
        uint64 startsAt;
        uint64 endsAt;
        bool approved;
        uint256 totalRevenue;
        uint256 totalStudioShare;
        uint256 totalCircleShare;
        uint256 totalArtistShare;
    }

    struct Proposal {
        ProposalType proposalType;
        address proposer;
        address subject;
        uint256 relatedId;
        uint256 value;
        bool flag;
        uint64 votingEndsAt;
        bool executed;
        bool approved;
        uint256 forVotes;
        uint256 againstVotes;
        string title;
        string details;
    }

    struct Milestone {
        uint256 quarterNumber;
        QuarterStage stage;
        bool completed;
        uint64 completedAt;
        string summary;
    }

    struct InvestmentInstallment {
        uint256 amount;
        uint64 dueAt;
        uint256 paidAmount;
    }

    IERC20 public immutable paymentToken;
    address public studioTreasury;
    address public circleWallet;
    uint256 public nextTierId = 1;
    uint256 public nextShowcaseId = 1;
    uint256 public nextProposalId = 1;
    uint256 public nextMilestoneId = 1;
    uint64 public defaultProposalDuration = 7 days;
    uint256 public proposalQuorum = 1;
    uint64 public immutable investmentRecordedAt;
    uint256 public accruedCircleBalance;
    uint256 public totalInvestmentRepaid;

    mapping(uint256 => MembershipTier) public membershipTiers;
    mapping(address => MemberRecord) public members;
    mapping(address => ArtistProfile) public artists;
    mapping(address => mapping(uint256 => QuarterlyReview)) public quarterlyReviews;
    mapping(uint8 => RevenueLedger) public revenueByStream;
    mapping(uint256 => Showcase) public showcases;
    mapping(uint256 => address[]) private showcaseParticipants;
    mapping(uint256 => mapping(address => uint16)) public showcaseParticipantBps;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => Milestone) public milestones;
    mapping(uint8 => InvestmentInstallment) public investmentInstallments;

    event StudioTreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event CircleWalletUpdated(address indexed previousWallet, address indexed newWallet);
    event CircleAccrualSwept(address indexed wallet, uint256 amount);
    event MembershipTierConfigured(
        uint256 indexed tierId,
        string name,
        uint256 monthlyPrice,
        uint256 annualPrice,
        bool active
    );
    event MembershipPaid(
        address indexed member,
        uint256 indexed tierId,
        BillingCadence cadence,
        uint256 amount,
        uint256 studioShare,
        uint256 circleShare,
        uint64 paidUntil,
        bool autoRenew
    );
    event MembershipSuspensionUpdated(address indexed member, bool suspended);
    event MembershipRenewalUpdated(address indexed member, bool autoRenew);
    event RevenueRecorded(
        RevenueStream indexed stream,
        address indexed payer,
        uint256 grossAmount,
        uint256 studioShare,
        uint256 circleShare,
        uint256 artistShare,
        string memo
    );
    event ArtistApplied(address indexed artist, string metadataURI);
    event ArtistStatusUpdated(
        address indexed artist,
        ArtistStatus indexed previousStatus,
        ArtistStatus indexed newStatus,
        bool sponsored,
        bool brandingRequired
    );
    event QuarterlyReviewRecorded(
        address indexed artist,
        uint256 indexed quarterNumber,
        QuarterStage indexed stage,
        string notes
    );
    event ShowcaseCreated(uint256 indexed showcaseId, string name, uint64 startsAt, uint64 endsAt);
    event ShowcaseApprovalUpdated(uint256 indexed showcaseId, bool approved);
    event ShowcaseRevenueDistributed(
        uint256 indexed showcaseId,
        address indexed payer,
        uint256 grossAmount,
        uint256 studioShare,
        uint256 circleShare,
        uint256 artistShare
    );
    event ProposalSubmitted(
        uint256 indexed proposalId,
        ProposalType indexed proposalType,
        address indexed proposer,
        address subject,
        uint256 relatedId,
        uint256 value,
        bool flag,
        uint64 votingEndsAt,
        string title
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, bool approved);
    event MilestoneCreated(uint256 indexed milestoneId, uint256 indexed quarterNumber, QuarterStage indexed stage, string summary);
    event MilestoneCompleted(uint256 indexed milestoneId);
    event InvestmentRepaymentRecorded(
        uint8 indexed installmentId,
        RevenueStream indexed stream,
        address indexed payer,
        uint256 amount,
        uint256 totalPaid,
        string memo
    );

    error InvalidAddress();
    error InvalidAmount();
    error InvalidTier();
    error InactiveTier();
    error InvalidShowcase();
    error ShowcaseNotApproved();
    error InvalidShareConfiguration();
    error InvalidProposal();
    error InvalidDuration();
    error InvalidQuorum();
    error NotSpenderDelegator();
    error NotEligibleVoter();
    error AlreadyVoted();
    error VotingClosed();
    error ProposalNotExecutable();
    error InvalidArtistState();
    error MembershipRequired();
    error MembershipSuspended();
    error MembershipNotDue();
    error InvalidRosterTerm();
    error InvalidInstallment();
    error InstallmentPaidInFull();

    constructor(address initialCircleWallet) Ownable(CONTRACT_OWNER) {
        paymentToken = IERC20(PRIMARY_USDC);
        studioTreasury = CONTRACT_OWNER;
        circleWallet = initialCircleWallet;
        investmentRecordedAt = uint64(block.timestamp);

        for (uint8 installmentId = 1; installmentId <= INVESTMENT_INSTALLMENT_COUNT; ++installmentId) {
            investmentInstallments[installmentId] = InvestmentInstallment({
                amount: INVESTMENT_INSTALLMENT_AMOUNT,
                dueAt: uint64(block.timestamp + (uint256(installmentId) * INVESTMENT_PAYMENT_INTERVAL)),
                paidAmount: 0
            });
        }
    }

    modifier onlyDelegator() {
        if (msg.sender != SPENDER_DELEGATOR) revert NotSpenderDelegator();
        _;
    }

    function setStudioTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        emit StudioTreasuryUpdated(studioTreasury, newTreasury);
        studioTreasury = newTreasury;
    }

    function setCircleWallet(address newWallet) external onlyOwner {
        emit CircleWalletUpdated(circleWallet, newWallet);
        circleWallet = newWallet;
    }

    function sweepAccruedCircleBalance() external onlyOwner nonReentrant {
        if (circleWallet == address(0)) revert InvalidAddress();
        uint256 amount = accruedCircleBalance;
        accruedCircleBalance = 0;
        paymentToken.safeTransfer(circleWallet, amount);
        emit CircleAccrualSwept(circleWallet, amount);
    }

    function setGovernanceConfig(uint256 newQuorum, uint64 newDuration) external onlyOwner {
        if (newQuorum == 0) revert InvalidQuorum();
        if (newDuration == 0) revert InvalidDuration();
        proposalQuorum = newQuorum;
        defaultProposalDuration = newDuration;
    }

    function configureMembershipTier(
        uint256 tierId,
        string calldata name,
        uint256 monthlyPrice,
        uint256 annualPrice,
        bool active
    ) external onlyOwner returns (uint256 configuredTierId) {
        if (bytes(name).length == 0) revert InvalidAmount();
        if (monthlyPrice == 0 || annualPrice == 0) revert InvalidAmount();

        configuredTierId = tierId;
        if (configuredTierId == 0) {
            configuredTierId = nextTierId++;
        } else if (configuredTierId >= nextTierId) {
            nextTierId = configuredTierId + 1;
        }

        membershipTiers[configuredTierId] = MembershipTier({
            name: name,
            monthlyPrice: monthlyPrice,
            annualPrice: annualPrice,
            active: active
        });

        emit MembershipTierConfigured(configuredTierId, name, monthlyPrice, annualPrice, active);
    }

    function enrollMembership(uint256 tierId, BillingCadence cadence, bool autoRenew) external nonReentrant {
        _processMembershipPayment(msg.sender, msg.sender, tierId, cadence, autoRenew);
    }

    function renewMembership(BillingCadence cadence, bool autoRenew) external nonReentrant {
        MemberRecord storage record = members[msg.sender];
        if (record.tierId == 0) revert MembershipRequired();
        _processMembershipPayment(msg.sender, msg.sender, record.tierId, cadence, autoRenew);
    }

    function collectRecurringMembership(address member) external onlyDelegator nonReentrant {
        MemberRecord storage record = members[member];
        if (record.tierId == 0) revert MembershipRequired();
        if (record.suspended) revert MembershipSuspended();
        if (!record.autoRenew) revert MembershipNotDue();
        if (record.paidUntil > block.timestamp) revert MembershipNotDue();
        _processMembershipPayment(member, member, record.tierId, record.cadence, true);
    }

    function setMemberSuspended(address member, bool suspended) external onlyOwner {
        MemberRecord storage record = members[member];
        if (record.tierId == 0) revert MembershipRequired();
        record.suspended = suspended;
        emit MembershipSuspensionUpdated(member, suspended);
    }

    function updateMembershipRenewal(bool autoRenew) external {
        MemberRecord storage record = members[msg.sender];
        if (record.tierId == 0) revert MembershipRequired();
        record.autoRenew = autoRenew;
        emit MembershipRenewalUpdated(msg.sender, autoRenew);
    }

    function membershipStanding(address member) public view returns (MemberStanding) {
        MemberRecord storage record = members[member];
        if (record.tierId == 0) return MemberStanding.None;
        if (record.suspended) return MemberStanding.Suspended;
        if (record.paidUntil >= block.timestamp) return MemberStanding.Active;
        return MemberStanding.Expired;
    }

    function isMemberVerified(address member) public view returns (bool) {
        return membershipStanding(member) == MemberStanding.Active;
    }

    function applyAsArtist(string calldata metadataURI) external {
        ArtistProfile storage profile = artists[msg.sender];
        if (profile.status != ArtistStatus.None) revert InvalidArtistState();
        profile.status = ArtistStatus.Applicant;
        profile.metadataURI = metadataURI;
        emit ArtistApplied(msg.sender, metadataURI);
    }

    function approveArtistMember(address artist, string calldata metadataURI) external onlyOwner {
        if (!isMemberVerified(artist)) revert MembershipRequired();

        ArtistProfile storage profile = artists[artist];
        if (profile.status != ArtistStatus.Applicant && profile.status != ArtistStatus.None) revert InvalidArtistState();

        ArtistStatus previousStatus = profile.status;
        profile.status = ArtistStatus.Member;
        profile.metadataURI = metadataURI;
        profile.sponsored = false;
        profile.brandingRequired = false;

        emit ArtistStatusUpdated(artist, previousStatus, ArtistStatus.Member, false, false);
    }

    function graduateArtist(address artist) external onlyOwner {
        ArtistProfile storage profile = artists[artist];
        if (profile.status != ArtistStatus.Roster) revert InvalidArtistState();

        ArtistStatus previousStatus = profile.status;
        profile.status = ArtistStatus.Alumni;
        profile.sponsored = false;
        profile.brandingRequired = false;

        emit ArtistStatusUpdated(artist, previousStatus, ArtistStatus.Alumni, false, false);
    }

    function recordQuarterlyReview(
        address artist,
        uint256 quarterNumber,
        QuarterStage stage,
        string calldata notes
    ) external onlyOwner {
        ArtistProfile storage profile = artists[artist];
        if (profile.status == ArtistStatus.None) revert InvalidArtistState();

        uint256 reviewIndex = ++profile.quarterlyReviewCount;
        quarterlyReviews[artist][reviewIndex] = QuarterlyReview({
            quarterNumber: quarterNumber,
            stage: stage,
            reviewedAt: uint64(block.timestamp),
            notes: notes
        });

        emit QuarterlyReviewRecorded(artist, quarterNumber, stage, notes);
    }

    function createShowcase(
        string calldata name,
        uint64 startsAt,
        uint64 endsAt,
        address[] calldata participants,
        uint16[] calldata participantBps
    ) external onlyOwner returns (uint256 showcaseId) {
        if (participants.length == 0 || participants.length != participantBps.length) revert InvalidShareConfiguration();
        if (endsAt < startsAt) revert InvalidDuration();

        uint256 totalBps;
        showcaseId = nextShowcaseId++;
        showcases[showcaseId] = Showcase({
            name: name,
            startsAt: startsAt,
            endsAt: endsAt,
            approved: false,
            totalRevenue: 0,
            totalStudioShare: 0,
            totalCircleShare: 0,
            totalArtistShare: 0
        });

        for (uint256 i = 0; i < participants.length; ++i) {
            if (participants[i] == address(0)) revert InvalidAddress();
            totalBps += participantBps[i];
            showcaseParticipants[showcaseId].push(participants[i]);
            showcaseParticipantBps[showcaseId][participants[i]] = participantBps[i];
        }

        if (totalBps != BPS_DENOMINATOR) revert InvalidShareConfiguration();
        emit ShowcaseCreated(showcaseId, name, startsAt, endsAt);
    }

    function getShowcaseParticipants(uint256 showcaseId) external view returns (address[] memory) {
        if (showcaseId == 0 || showcaseId >= nextShowcaseId) revert InvalidShowcase();
        return showcaseParticipants[showcaseId];
    }

    function submitProposal(
        ProposalType proposalType,
        address subject,
        uint256 relatedId,
        uint256 value,
        bool flag,
        uint64 votingDuration,
        string calldata title,
        string calldata details
    ) external returns (uint256 proposalId) {
        if (!_canVote(msg.sender)) revert NotEligibleVoter();

        uint64 duration = votingDuration == 0 ? defaultProposalDuration : votingDuration;
        if (duration == 0) revert InvalidDuration();

        proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            proposalType: proposalType,
            proposer: msg.sender,
            subject: subject,
            relatedId: relatedId,
            value: value,
            flag: flag,
            votingEndsAt: uint64(block.timestamp + duration),
            executed: false,
            approved: false,
            forVotes: 0,
            againstVotes: 0,
            title: title,
            details: details
        });

        emit ProposalSubmitted(
            proposalId,
            proposalType,
            msg.sender,
            subject,
            relatedId,
            value,
            flag,
            uint64(block.timestamp + duration),
            title
        );
    }

    function castVote(uint256 proposalId, bool support) external {
        if (!_canVote(msg.sender)) revert NotEligibleVoter();

        Proposal storage proposal = proposals[proposalId];
        if (proposal.votingEndsAt == 0) revert InvalidProposal();
        if (block.timestamp > proposal.votingEndsAt) revert VotingClosed();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            ++proposal.forVotes;
        } else {
            ++proposal.againstVotes;
        }

        emit VoteCast(proposalId, msg.sender, support, 1);
    }

    function executeProposal(uint256 proposalId) external onlyOwner {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.votingEndsAt == 0) revert InvalidProposal();
        if (proposal.executed) revert ProposalNotExecutable();
        if (block.timestamp <= proposal.votingEndsAt) revert VotingClosed();
        if (proposal.forVotes < proposalQuorum || proposal.forVotes <= proposal.againstVotes) revert ProposalNotExecutable();

        proposal.executed = true;
        proposal.approved = true;

        if (proposal.proposalType == ProposalType.ArtistRoster) {
            _promoteArtistToRoster(proposal.subject, proposal.value, proposal.flag);
        } else if (proposal.proposalType == ProposalType.ShowcaseApproval) {
            _approveShowcase(proposal.relatedId);
        } else if (proposal.proposalType == ProposalType.Milestone) {
            _completeMilestone(proposal.relatedId);
        }

        emit ProposalExecuted(proposalId, true);
    }

    function createMilestone(
        uint256 quarterNumber,
        QuarterStage stage,
        string calldata summary
    ) external onlyOwner returns (uint256 milestoneId) {
        milestoneId = nextMilestoneId++;
        milestones[milestoneId] = Milestone({
            quarterNumber: quarterNumber,
            stage: stage,
            completed: false,
            completedAt: 0,
            summary: summary
        });

        emit MilestoneCreated(milestoneId, quarterNumber, stage, summary);
    }

    function recordRevenue(
        RevenueStream stream,
        uint256 amount,
        string calldata memo
    ) external nonReentrant {
        _recordRevenue(stream, msg.sender, amount, memo);
    }

    function recordRevenueFrom(
        address payer,
        RevenueStream stream,
        uint256 amount,
        string calldata memo
    ) external onlyDelegator nonReentrant {
        _recordRevenue(stream, payer, amount, memo);
    }

    function recordShowcaseRevenue(
        uint256 showcaseId,
        uint256 amount,
        string calldata memo
    ) external nonReentrant {
        _recordShowcaseRevenue(showcaseId, msg.sender, amount, memo);
    }

    function recordShowcaseRevenueFrom(
        uint256 showcaseId,
        address payer,
        uint256 amount,
        string calldata memo
    ) external onlyDelegator nonReentrant {
        _recordShowcaseRevenue(showcaseId, payer, amount, memo);
    }

    function recordInvestmentRepayment(
        uint8 installmentId,
        RevenueStream stream,
        uint256 amount,
        string calldata memo
    ) external nonReentrant {
        _recordInvestmentRepayment(installmentId, stream, msg.sender, amount, memo);
    }

    function recordInvestmentRepaymentFrom(
        uint8 installmentId,
        RevenueStream stream,
        address payer,
        uint256 amount,
        string calldata memo
    ) external onlyDelegator nonReentrant {
        _recordInvestmentRepayment(installmentId, stream, payer, amount, memo);
    }

    function outstandingInvestmentBalance() external view returns (uint256) {
        return INVESTMENT_TOTAL_REPAYMENT - totalInvestmentRepaid;
    }

    function _processMembershipPayment(
        address payer,
        address member,
        uint256 tierId,
        BillingCadence cadence,
        bool autoRenew
    ) internal {
        MembershipTier storage tier = membershipTiers[tierId];
        if (bytes(tier.name).length == 0) revert InvalidTier();
        if (!tier.active) revert InactiveTier();

        uint256 amount = cadence == BillingCadence.Monthly ? tier.monthlyPrice : tier.annualPrice;
        if (amount == 0) revert InvalidAmount();

        MemberRecord storage record = members[member];
        if (record.suspended) revert MembershipSuspended();

        paymentToken.safeTransferFrom(payer, address(this), amount);
        (uint256 studioShare, uint256 circleShare) = _splitStandard(amount);

        paymentToken.safeTransfer(studioTreasury, studioShare);
        _distributeCircleShare(circleShare);

        record.tierId = tierId;
        record.cadence = cadence;
        record.autoRenew = autoRenew;
        record.totalPaid += amount;
        uint64 baseTime = record.paidUntil > block.timestamp ? record.paidUntil : uint64(block.timestamp);
        record.paidUntil = uint64(baseTime + (cadence == BillingCadence.Monthly ? 30 days : 365 days));

        RevenueLedger storage ledger = revenueByStream[uint8(RevenueStream.Membership)];
        ledger.gross += amount;
        ledger.studioShare += studioShare;
        ledger.circleShare += circleShare;

        emit MembershipPaid(member, tierId, cadence, amount, studioShare, circleShare, record.paidUntil, autoRenew);
        emit RevenueRecorded(RevenueStream.Membership, payer, amount, studioShare, circleShare, 0, "membership");
    }

    function _recordRevenue(
        RevenueStream stream,
        address payer,
        uint256 amount,
        string calldata memo
    ) internal {
        if (payer == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        paymentToken.safeTransferFrom(payer, address(this), amount);
        (uint256 studioShare, uint256 circleShare) = _splitStandard(amount);

        paymentToken.safeTransfer(studioTreasury, studioShare);
        _distributeCircleShare(circleShare);

        RevenueLedger storage ledger = revenueByStream[uint8(stream)];
        ledger.gross += amount;
        ledger.studioShare += studioShare;
        ledger.circleShare += circleShare;

        emit RevenueRecorded(stream, payer, amount, studioShare, circleShare, 0, memo);
    }

    function _recordShowcaseRevenue(
        uint256 showcaseId,
        address payer,
        uint256 amount,
        string calldata memo
    ) internal {
        if (amount == 0) revert InvalidAmount();
        if (showcaseId == 0 || showcaseId >= nextShowcaseId) revert InvalidShowcase();

        Showcase storage showcase = showcases[showcaseId];
        if (!showcase.approved) revert ShowcaseNotApproved();

        paymentToken.safeTransferFrom(payer, address(this), amount);

        uint256 circleShare = (amount * CIRCLE_BPS) / BPS_DENOMINATOR;
        uint256 remaining = amount - circleShare;
        uint256 studioShare = (remaining * SHOWCASE_STUDIO_BPS) / BPS_DENOMINATOR;
        uint256 artistShare = remaining - studioShare;

        paymentToken.safeTransfer(studioTreasury, studioShare);
        _distributeCircleShare(circleShare);
        _distributeShowcaseArtists(showcaseId, artistShare);

        showcase.totalRevenue += amount;
        showcase.totalStudioShare += studioShare;
        showcase.totalCircleShare += circleShare;
        showcase.totalArtistShare += artistShare;

        RevenueLedger storage ledger = revenueByStream[uint8(RevenueStream.Event)];
        ledger.gross += amount;
        ledger.studioShare += studioShare;
        ledger.circleShare += circleShare;
        ledger.artistShare += artistShare;

        emit RevenueRecorded(RevenueStream.Event, payer, amount, studioShare, circleShare, artistShare, memo);
        emit ShowcaseRevenueDistributed(showcaseId, payer, amount, studioShare, circleShare, artistShare);
    }

    function _recordInvestmentRepayment(
        uint8 installmentId,
        RevenueStream stream,
        address payer,
        uint256 amount,
        string calldata memo
    ) internal {
        if (amount == 0) revert InvalidAmount();
        if (installmentId == 0 || installmentId > INVESTMENT_INSTALLMENT_COUNT) revert InvalidInstallment();

        InvestmentInstallment storage installment = investmentInstallments[installmentId];
        if (installment.paidAmount >= installment.amount) revert InstallmentPaidInFull();
        if (installment.paidAmount + amount > installment.amount) revert InvalidAmount();

        paymentToken.safeTransferFrom(payer, address(this), amount);
        _distributeCircleShare(amount);

        installment.paidAmount += amount;
        totalInvestmentRepaid += amount;

        emit InvestmentRepaymentRecorded(installmentId, stream, payer, amount, installment.paidAmount, memo);
    }

    function _splitStandard(uint256 amount) internal pure returns (uint256 studioShare, uint256 circleShare) {
        circleShare = (amount * CIRCLE_BPS) / BPS_DENOMINATOR;
        studioShare = amount - circleShare;
    }

    function _distributeCircleShare(uint256 amount) internal {
        if (amount == 0) return;

        if (circleWallet == address(0)) {
            accruedCircleBalance += amount;
        } else {
            paymentToken.safeTransfer(circleWallet, amount);
        }
    }

    function _distributeShowcaseArtists(uint256 showcaseId, uint256 amount) internal {
        address[] storage participants = showcaseParticipants[showcaseId];
        uint256 distributed;

        for (uint256 i = 0; i < participants.length; ++i) {
            uint256 artistAmount;
            if (i == participants.length - 1) {
                artistAmount = amount - distributed;
            } else {
                artistAmount = (amount * showcaseParticipantBps[showcaseId][participants[i]]) / BPS_DENOMINATOR;
                distributed += artistAmount;
            }

            paymentToken.safeTransfer(participants[i], artistAmount);
        }
    }

    function _promoteArtistToRoster(address artist, uint256 rosterTerm, bool sponsored) internal {
        if (!isMemberVerified(artist)) revert MembershipRequired();
        if (rosterTerm < MIN_ROSTER_TERM || rosterTerm > MAX_ROSTER_TERM) revert InvalidRosterTerm();

        ArtistProfile storage profile = artists[artist];
        if (profile.status != ArtistStatus.Member) revert InvalidArtistState();

        ArtistStatus previousStatus = profile.status;
        profile.status = ArtistStatus.Roster;
        profile.sponsored = sponsored;
        profile.brandingRequired = sponsored;
        profile.rosterStartedAt = uint64(block.timestamp);
        profile.rosterEndsAt = uint64(block.timestamp + rosterTerm);

        emit ArtistStatusUpdated(artist, previousStatus, ArtistStatus.Roster, sponsored, sponsored);
    }

    function _approveShowcase(uint256 showcaseId) internal {
        if (showcaseId == 0 || showcaseId >= nextShowcaseId) revert InvalidShowcase();
        showcases[showcaseId].approved = true;
        emit ShowcaseApprovalUpdated(showcaseId, true);
    }

    function _completeMilestone(uint256 milestoneId) internal {
        Milestone storage milestone = milestones[milestoneId];
        if (milestone.quarterNumber == 0) revert InvalidProposal();
        milestone.completed = true;
        milestone.completedAt = uint64(block.timestamp);
        emit MilestoneCompleted(milestoneId);
    }

    function _canVote(address voter) internal view returns (bool) {
        return voter == owner() || isMemberVerified(voter);
    }
}
