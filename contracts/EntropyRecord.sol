// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EntropyRecord
 * @notice Request-style contract record for a specific USDC transfer authorization.
 * @dev This contract DOES NOT move tokens. It stores and emits a formal on-chain request.
 */
contract EntropyRecord {
    enum Status {
        Draft,
        Submitted,
        Cancelled
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
    }

    address public constant SPENDER_DELEGATOR = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    address public constant RECIPIENT = 0x0311502EA9AcF3a532d32C8D8830839Ce34bD378;
    bytes32 public constant APPROVAL_TX_HASH =
        0x6387457c5600500934253031a1356f8c61f48ed9d891da1385551cde629c1181;

    uint256 public nextRequestId = 1;
    mapping(uint256 => Request) public requests;

    event PermitRequestSubmitted(
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

    event PermitRequestCancelled(uint256 indexed requestId, address indexed requester);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error NotRequester();
    error InvalidStatus();

    function submitRequest(
        address usdcToken,
        uint256 amount,
        uint256 chainId,
        uint256 deadline
    ) external returns (uint256 requestId) {
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
            chainId: chainId,
            deadline: deadline,
            purpose: "transfer/trade with metamask eip-7702 delegator",
            status: Status.Submitted,
            createdAt: block.timestamp
        });

        emit PermitRequestSubmitted(
            requestId,
            msg.sender,
            usdcToken,
            SPENDER_DELEGATOR,
            RECIPIENT,
            amount,
            APPROVAL_TX_HASH,
            chainId,
            deadline,
            "transfer/trade with metamask eip-7702 delegator"
        );
    }

    function cancelRequest(uint256 requestId) external {
        Request storage r = requests[requestId];
        if (r.requester != msg.sender) revert NotRequester();
        if (r.status != Status.Submitted) revert InvalidStatus();

        r.status = Status.Cancelled;
        emit PermitRequestCancelled(requestId, msg.sender);
    }

    function isActive(uint256 requestId) external view returns (bool) {
        Request storage r = requests[requestId];
        return (r.status == Status.Submitted && block.timestamp <= r.deadline);
    }
}
