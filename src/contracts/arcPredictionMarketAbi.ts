export const arcPredictionMarketV3Abi = [
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "string", name: "question", indexed: false },
      { type: "string", name: "category", indexed: false },
      { type: "address", name: "settlementToken", indexed: true },
      { type: "uint256", name: "closeTime", indexed: false },
      { type: "uint256", name: "resolutionTime", indexed: false },
      { type: "address", name: "creator", indexed: true },
      { type: "address", name: "authority", indexed: false },
      { type: "uint8", name: "resolutionMode", indexed: false },
      { type: "bytes32", name: "metadataHash", indexed: false },
      { type: "string", name: "metadataURI", indexed: false }
    ]
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "user", indexed: true },
      { type: "uint8", name: "side", indexed: true },
      { type: "uint256", name: "amount", indexed: false },
      { type: "uint256", name: "yesPool", indexed: false },
      { type: "uint256", name: "noPool", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketResultProposed",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "uint8", name: "outcome", indexed: false },
      { type: "uint256", name: "disputeDeadline", indexed: false },
      { type: "address", name: "proposer", indexed: true },
      { type: "bytes32", name: "evidenceHash", indexed: false },
      { type: "bytes32", name: "aiReceiptHash", indexed: false },
      { type: "bool", name: "authorityReviewRequired", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AuthorityReviewRequested",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "authority", indexed: true },
      { type: "bytes32", name: "reasonHash", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketDisputed",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "disputer", indexed: true },
      { type: "uint8", name: "proposedOutcome", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "uint8", name: "outcome", indexed: false }
    ]
  },
  {
    type: "event",
    name: "DisputeFinalized",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "uint8", name: "finalOutcome", indexed: false },
      { type: "address", name: "bondRecipient", indexed: true }
    ]
  },
  {
    type: "event",
    name: "DisputeCanceledByTimeout",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "creator", indexed: true },
      { type: "address", name: "disputer", indexed: true }
    ]
  },
  {
    type: "event",
    name: "EmptyMarketCanceled",
    inputs: [{ type: "uint256", name: "marketId", indexed: true }]
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "user", indexed: true },
      { type: "address", name: "token", indexed: true },
      { type: "uint256", name: "payout", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketCreationFeeCollected",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "creator", indexed: true },
      { type: "address", name: "token", indexed: true },
      { type: "uint256", name: "fee", indexed: false }
    ]
  },
  {
    type: "event",
    name: "PlatformPauseUpdated",
    inputs: [{ type: "bool", name: "paused", indexed: false }]
  },
  {
    type: "event",
    name: "RestrictedMarketCreationUpdated",
    inputs: [{ type: "bool", name: "restricted", indexed: false }]
  },
  {
    type: "event",
    name: "MarketCreatorApprovalUpdated",
    inputs: [
      { type: "address", name: "account", indexed: true },
      { type: "bool", name: "approved", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AccountBlockUpdated",
    inputs: [
      { type: "address", name: "account", indexed: true },
      { type: "bool", name: "blocked", indexed: false }
    ]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "resolutionAuthority",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "platformPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "restrictedMarketCreation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "approvedMarketCreators",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "blockedAccounts",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "defaultSettlementToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "CONTRACT_VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  },
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "creatorBond",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "disputeBond",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "disputeWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "disputeGracePeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "protocolFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "marketCreationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "accumulatedProtocolFees",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "assetConfigs",
    stateMutability: "view",
    inputs: [{ type: "address", name: "token" }],
    outputs: [
      { type: "bool", name: "enabled" },
      { type: "string", name: "symbol" },
      { type: "uint8", name: "decimals" },
      { type: "uint256", name: "minStake" },
      { type: "uint256", name: "creatorBond" },
      { type: "uint256", name: "disputeBond" },
      { type: "uint256", name: "marketCreationFee" }
    ]
  },
  {
    type: "function",
    name: "pendingWithdrawals",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "token" },
      { type: "address", name: "recipient" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "setProtocolFeeBps",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "newFeeBps" }],
    outputs: []
  },
  {
    type: "function",
    name: "setMarketCreationFee",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "newFee" }],
    outputs: []
  },
  {
    type: "function",
    name: "setResolutionAuthority",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "newAuthority" }],
    outputs: []
  },
  {
    type: "function",
    name: "setPlatformPaused",
    stateMutability: "nonpayable",
    inputs: [{ type: "bool", name: "paused" }],
    outputs: []
  },
  {
    type: "function",
    name: "setRestrictedMarketCreation",
    stateMutability: "nonpayable",
    inputs: [{ type: "bool", name: "restricted" }],
    outputs: []
  },
  {
    type: "function",
    name: "setApprovedMarketCreator",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "account" },
      { type: "bool", name: "approved" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setBlockedAccount",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "account" },
      { type: "bool", name: "blocked" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawProtocolFees",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "recipient" },
      { type: "uint256", name: "amount" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawBalance",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "token" }],
    outputs: []
  },
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { type: "string", name: "question" },
      { type: "string", name: "category" },
      { type: "address", name: "settlementToken" },
      { type: "uint256", name: "closeTime" },
      { type: "uint256", name: "resolutionTime" },
      { type: "bytes32", name: "metadataHash" },
      { type: "string", name: "metadataURI" },
      { type: "uint8", name: "resolutionMode" }
    ],
    outputs: [{ type: "uint256", name: "marketId" }]
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "uint8", name: "side" },
      { type: "uint256", name: "amount" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "uint8", name: "outcome" },
      { type: "bytes32", name: "evidenceHash" },
      { type: "bytes32", name: "aiReceiptHash" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "bytes32", name: "evidenceHash" },
      { type: "bytes32", name: "aiReceiptHash" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "requestAuthorityReview",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "bytes32", name: "reasonHash" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "dispute",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  },
  {
    type: "function",
    name: "finalize",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelEmptyMarket",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelStaleDispute",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeDispute",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "uint8", name: "finalOutcome" },
      { type: "bytes32", name: "evidenceHash" },
      { type: "bytes32", name: "aiReceiptHash" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: [{ type: "uint256", name: "payout" }]
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: [
      { type: "string", name: "question" },
      { type: "string", name: "category" },
      { type: "address", name: "settlementToken" },
      { type: "uint256", name: "closeTime" },
      { type: "uint256", name: "resolutionTime" },
      { type: "address", name: "creator" },
      { type: "address", name: "resolver" },
      { type: "address", name: "authority" },
      { type: "uint8", name: "resolutionMode" },
      { type: "bytes32", name: "metadataHash" },
      { type: "string", name: "metadataURI" },
      { type: "uint256", name: "termsProtocolFeeBps" },
      { type: "uint256", name: "termsCreatorBond" },
      { type: "uint256", name: "termsDisputeBond" },
      { type: "uint256", name: "termsDisputeWindow" },
      { type: "uint256", name: "yesPool" },
      { type: "uint256", name: "noPool" },
      { type: "uint256", name: "traderCount" },
      { type: "uint8", name: "proposedOutcome" },
      { type: "uint256", name: "proposedAt" },
      { type: "uint256", name: "disputeDeadline" },
      { type: "bool", name: "authorityReviewRequired" },
      { type: "bool", name: "disputed" },
      { type: "address", name: "disputer" },
      { type: "uint8", name: "outcome" },
      { type: "uint256", name: "termsDisputeGracePeriod" }
    ]
  },
  {
    type: "function",
    name: "positionOf",
    stateMutability: "view",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "address", name: "user" }
    ],
    outputs: [
      { type: "uint256", name: "yes" },
      { type: "uint256", name: "no" },
      { type: "bool", name: "claimed" }
    ]
  },
  {
    type: "function",
    name: "potentialPayout",
    stateMutability: "view",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "address", name: "user" }
    ],
    outputs: [{ type: "uint256" }]
  }
] as const;

export const settlementTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "spender" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "amount" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;
