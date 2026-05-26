export const arcPredictionMarketV2Abi = [
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "string", name: "question", indexed: false },
      { type: "string", name: "category", indexed: false },
      { type: "uint256", name: "closeTime", indexed: false },
      { type: "address", name: "creator", indexed: true },
      { type: "address", name: "resolver", indexed: true }
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
      { type: "uint256", name: "disputeDeadline", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketResultProposer",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "proposer", indexed: true }
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
    name: "MarketCreationFeeCollected",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "creator", indexed: true },
      { type: "uint256", name: "fee", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { type: "uint256", name: "marketId", indexed: true },
      { type: "address", name: "user", indexed: true },
      { type: "uint256", name: "payout", indexed: false }
    ]
  },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "resolutionAuthority", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "CONTRACT_VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "marketCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minStake", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "creatorBond", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "disputeBond", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "disputeWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "disputeGracePeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "marketCreationFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "accumulatedProtocolFees", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "withdrawProtocolFees",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "recipient" }, { type: "uint256", name: "amount" }],
    outputs: []
  },
  {
    type: "function",
    name: "createMarket",
    stateMutability: "payable",
    inputs: [{ type: "string", name: "question" }, { type: "string", name: "category" }, { type: "uint256", name: "closeTime" }],
    outputs: [{ type: "uint256", name: "marketId" }]
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "payable",
    inputs: [{ type: "uint256", name: "marketId" }, { type: "uint8", name: "side" }],
    outputs: []
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }, { type: "uint8", name: "outcome" }],
    outputs: []
  },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "marketId" }], outputs: [] },
  { type: "function", name: "dispute", stateMutability: "payable", inputs: [{ type: "uint256", name: "marketId" }], outputs: [] },
  { type: "function", name: "finalize", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "marketId" }], outputs: [] },
  { type: "function", name: "cancelStaleDispute", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "marketId" }], outputs: [] },
  {
    type: "function",
    name: "finalizeDispute",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }, { type: "uint8", name: "finalOutcome" }],
    outputs: []
  },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "marketId" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: [
      { type: "string", name: "question" },
      { type: "string", name: "category" },
      { type: "uint256", name: "closeTime" },
      { type: "address", name: "creator" },
      { type: "address", name: "resolver" },
      { type: "uint256", name: "yesPool" },
      { type: "uint256", name: "noPool" },
      { type: "uint256", name: "traderCount" },
      { type: "uint8", name: "proposedOutcome" },
      { type: "uint256", name: "proposedAt" },
      { type: "uint256", name: "disputeDeadline" },
      { type: "bool", name: "disputed" },
      { type: "address", name: "disputer" },
      { type: "uint8", name: "outcome" }
    ]
  },
  {
    type: "function",
    name: "positionOf",
    stateMutability: "view",
    inputs: [{ type: "uint256", name: "marketId" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256", name: "yes" }, { type: "uint256", name: "no" }, { type: "bool", name: "claimed" }]
  },
  {
    type: "function",
    name: "potentialPayout",
    stateMutability: "view",
    inputs: [{ type: "uint256", name: "marketId" }, { type: "address", name: "user" }],
    outputs: [{ type: "uint256" }]
  }
] as const;
