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

export const FEE_ALLOWANCE_TYPE_MAP: Record<string, string> = {
  "/cosmos.feegrant.v1beta1.BasicAllowance": "cosmos-sdk/BasicAllowance",
  "/cosmos.feegrant.v1beta1.PeriodicAllowance": "cosmos-sdk/PeriodicAllowance",
  "/cosmos.feegrant.v1beta1.AllowedMsgAllowance":
    "cosmos-sdk/AllowedMsgAllowance",
};

export const PUBKEY_TYPE_MAP: Record<string, string> = {
  "/cosmos.crypto.ed25519.PubKey": "tendermint/PubKeyEd25519",
  "/cosmos.crypto.secp256k1.PubKey": "tendermint/PubKeySecp256k1",
  "/cosmos.crypto.sr25519.PubKey": "tendermint/PubKeySr25519",
};

export const AUTHZ_TYPE_MAP: Record<string, string> = {
  "/cosmos.authz.v1beta1.GenericAuthorization":
    "cosmos-sdk/GenericAuthorization",
  "/cosmos.bank.v1beta1.SendAuthorization": "cosmos-sdk/SendAuthorization",
  "/cosmos.staking.v1beta1.StakeAuthorization": "cosmos-sdk/StakeAuthorization",
  "/cosmos.feegrant.v1beta1.AllowedMsgAllowance":
    "cosmos-sdk/AllowedMsgAllowance",
  "/cosmos.feegrant.v1beta1.BasicAllowance": "cosmos-sdk/BasicAllowance",
  "/cosmos.feegrant.v1beta1.PeriodicAllowance": "cosmos-sdk/PeriodicAllowance",
};
