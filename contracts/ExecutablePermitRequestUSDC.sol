// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExecutablePermitRequestUSDC
 * @notice Records a permit-style request and allows one-time execution of USDC transferFrom.
 * @dev Assumes USDC has already approved this contract (or compatible allowance flow set it).
 */
contract ExecutablePermitRequestUSDC is Ownable {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Submitted,
        Executed,
        Cancelled,
        Expired
    }

    struct Request {
        address requester;
        address spenderDelegator;
        address token;
        address recipient;
        uint256 amount;
        bytes32 approvalTxHash;
        uint256 chainId;
        uint256 deadline;
        string purpose;
        Status status;
        uint256 createdAt;
        uint256 executedAt;
    }

    address public constant SPENDER_DELEGATOR = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    address public constant RECIPIENT = 0x0311502EA9AcF3a532d32C8D8830839Ce34bD378;
    bytes32 public constant APPROVAL_TX_HASH =
        0x6387457c5600500934253031a1356f8c61f48ed9d891da1385551cde629c1181;
    uint256 public nextRequestId = 1;
    mapping(uint256 => Request) public requests;
    mapping(address => bool) public executors;

    event RequestSubmitted(
        uint256 indexed requestId,
        address indexed requester,
        address indexed token,
        address spenderDelegator,
        address recipient,
        uint256 amount,
        bytes32 approvalTxHash,
        uint256 chainId,
        uint256 deadline,
        string purpose
    );

    event RequestExecuted(
        uint256 indexed requestId,
        address indexed executor,
        address indexed token,
        address from,
        address to,
        uint256 amount
    );

    event RequestCancelled(uint256 indexed requestId, address indexed requester);
    event ExecutorSet(address indexed executor, bool allowed);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidChain();
    error InvalidStatus();
    error NotRequester();
    error NotAuthorizedExecutor();
    error RequestExpired();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAuthorizedExecutor() {
        if (msg.sender != SPENDER_DELEGATOR && !executors[msg.sender]) {
            revert NotAuthorizedExecutor();
        }
        _;
    }

    function setExecutor(address executor, bool allowed) external onlyOwner {
        if (executor == address(0)) revert InvalidAddress();
        executors[executor] = allowed;
        emit ExecutorSet(executor, allowed);
    }

    function submitRequest(address usdcToken, uint256 amount, uint256 deadline) external returns (uint256 requestId) {
        if (usdcToken == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        requestId = nextRequestId++;
        requests[requestId] = Request({
            requester: msg.sender,
            spenderDelegator: SPENDER_DELEGATOR,
            token: usdcToken,
            recipient: RECIPIENT,
            amount: amount,
            approvalTxHash: APPROVAL_TX_HASH,
            chainId: block.chainid,
            deadline: deadline,
            purpose: "transfer/trade with metamask eip-7702 delegator",
            status: Status.Submitted,
            createdAt: block.timestamp,
            executedAt: 0
        });

        emit RequestSubmitted(
            requestId,
            msg.sender,
            usdcToken,
            SPENDER_DELEGATOR,
            RECIPIENT,
            amount,
            APPROVAL_TX_HASH,
            block.chainid,
            deadline,
            "transfer/trade with metamask eip-7702 delegator"
        );
    }

    function executeRequest(uint256 requestId) external onlyAuthorizedExecutor {
        Request storage r = requests[requestId];

        if (r.status != Status.Submitted) revert InvalidStatus();
        if (r.chainId != block.chainid) revert InvalidChain();
        if (block.timestamp > r.deadline) {
            r.status = Status.Expired;
            revert RequestExpired();
        }

        r.status = Status.Executed;
        r.executedAt = block.timestamp;

        IERC20(r.token).safeTransferFrom(r.requester, r.recipient, r.amount);

        emit RequestExecuted(
            requestId,
            msg.sender,
            r.token,
            r.requester,
            r.recipient,
            r.amount
        );
    }

    function cancelRequest(uint256 requestId) external {
        Request storage r = requests[requestId];
        if (r.requester != msg.sender) revert NotRequester();
        if (r.status != Status.Submitted) revert InvalidStatus();

        r.status = Status.Cancelled;
        emit RequestCancelled(requestId, msg.sender);
    }

    function isActive(uint256 requestId) external view returns (bool) {
        Request storage r = requests[requestId];
        return r.status == Status.Submitted && block.timestamp <= r.deadline;
    }
}
