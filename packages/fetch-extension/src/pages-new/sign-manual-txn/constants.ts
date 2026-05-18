export const NEEDS_EXPLICIT_PARSING_MESSAGE_TYPES = new Set([
  "/cosmos.staking.v1beta1.MsgCreateValidator",
  "/cosmos.staking.v1beta1.MsgEditValidator",
  "/cosmwasm.wasm.v1.MsgExecuteContract",
  "/cosmwasm.wasm.v1.MsgInstantiateContract",
  "/cosmwasm.wasm.v1.MsgMigrateContract",
  "/cosmos.authz.v1beta1.MsgGrant",
  "/cosmos.authz.v1beta1.MsgExec",
  "/cosmos.authz.v1beta1.MsgRevoke",
  "/cosmos.feegrant.v1beta1.MsgGrantAllowance",
  "/cosmos.feegrant.v1beta1.MsgRevokeAllowance",
]);

export const TRANSACTION_SIGNER_FIELDS = [
  "from_address",
  "delegator_address",
  "voter",
  "sender",
  "proposer",
  "validator_address",
  "depositor",
  "granter",
  "authority",
  "grantee",
];

export const COSMOS_MSG_TYPES_PROTO: Record<string, string> = {
  "/cosmos.bank.v1beta1.MsgSend": "send",
  "/cosmos.staking.v1beta1.MsgDelegate": "delegate",
  "/cosmos.staking.v1beta1.MsgUndelegate": "undelegate",
  "/cosmos.staking.v1beta1.MsgBeginRedelegate": "redelegate",
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward": "withdrawRewards",
  "/cosmos.gov.v1beta1.MsgVote": "govVote",
  "/cosmos.gov.v1beta1.MsgSubmitProposal": "govSubmitProposal",
  "/ibc.applications.transfer.v1.MsgTransfer": "ibcTransfer",
  "/cosmwasm.wasm.v1.MsgExecuteContract": "executeWasm",
};

export const BROADCAST_SUPPORTED_MSG_TYPES = [
  "/cosmos.bank.v1beta1.MsgSend",
  "/cosmos.staking.v1beta1.MsgDelegate",
  "/cosmos.staking.v1beta1.MsgUndelegate",
  "/cosmos.staking.v1beta1.MsgBeginRedelegate",
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
  "/cosmos.gov.v1beta1.MsgVote",
  "/cosmos.gov.v1beta1.MsgSubmitProposal",
  "/cosmwasm.wasm.v1.MsgExecuteContract",
  "/ibc.applications.transfer.v1.MsgTransfer",
];
