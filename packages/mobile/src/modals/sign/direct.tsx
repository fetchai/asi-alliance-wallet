import { AppCurrency } from "@keplr-wallet/types";
import { MsgSend } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/tx";
import {
  MsgBeginRedelegate,
  MsgDelegate,
  MsgUndelegate,
} from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/tx";
import {
  MsgVote,
  MsgSubmitProposal,
} from "@keplr-wallet/proto-types/cosmos/gov/v1beta1/tx";
import { MsgWithdrawDelegatorReward } from "@keplr-wallet/proto-types/cosmos/distribution/v1beta1/tx";
import {
  MsgExecuteContract,
  MsgInstantiateContract,
} from "@keplr-wallet/proto-types/cosmwasm/wasm/v1/tx";
import { MsgTransfer } from "@keplr-wallet/proto-types/ibc/applications/transfer/v1/tx";
import {
  MsgGrant,
  MsgRevoke,
} from "@keplr-wallet/proto-types/cosmos/authz/v1beta1/tx";
import { GenericAuthorization } from "@keplr-wallet/proto-types/cosmos/authz/v1beta1/authz";
import { SendAuthorization } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/authz";
import { StakeAuthorization } from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/authz";
import { AnyWithUnpacked, UnknownMessage } from "@keplr-wallet/cosmos";
import {
  renderMsgBeginRedelegate,
  renderMsgDelegate,
  renderMsgExecuteContract,
  renderMsgInstantiateContract,
  renderMsgSend,
  renderMsgSubmitProposal,
  renderMsgUndelegate,
  renderMsgTransfer,
  renderMsgVote,
  renderMsgWithdrawDelegatorReward,
  renderGenericMsgGrant,
  renderStakeMsgGrant,
  renderSendMsgGrant,
  renderMsgRevoke,
  renderUnknownMessage,
} from "./messages";
import { Buffer } from "buffer/";

export function renderDirectMessage(
  msg: AnyWithUnpacked,
  currencies: AppCurrency[]
) {
  try {
    if (msg instanceof UnknownMessage) {
      return renderUnknownMessage(msg.toJSON());
    }

    if ("unpacked" in msg) {
      switch (msg.typeUrl) {
        case "/cosmos.bank.v1beta1.MsgSend": {
          const sendMsg = msg.unpacked as MsgSend;
          return renderMsgSend(currencies, sendMsg.amount, sendMsg.toAddress);
        }
        case "/cosmos.staking.v1beta1.MsgDelegate": {
          const delegateMsg = msg.unpacked as MsgDelegate;
          if (delegateMsg.amount) {
            return renderMsgDelegate(
              currencies,
              delegateMsg.amount,
              delegateMsg.validatorAddress
            );
          }
          break;
        }
        case "/cosmos.staking.v1beta1.MsgBeginRedelegate": {
          const redelegateMsg = msg.unpacked as MsgBeginRedelegate;
          if (redelegateMsg.amount) {
            return renderMsgBeginRedelegate(
              currencies,
              redelegateMsg.amount,
              redelegateMsg.validatorSrcAddress,
              redelegateMsg.validatorDstAddress
            );
          }
          break;
        }
        case "/cosmos.staking.v1beta1.MsgUndelegate": {
          const undelegateMsg = msg.unpacked as MsgUndelegate;
          if (undelegateMsg.amount) {
            return renderMsgUndelegate(
              currencies,
              undelegateMsg.amount,
              undelegateMsg.validatorAddress
            );
          }
          break;
        }
        case "/cosmos.gov.v1beta1.MsgSubmitProposal": {
          const value = msg.unpacked as MsgSubmitProposal;
          if (value.content && value.proposer) {
            return renderMsgSubmitProposal(
              value.proposer,
              value.content,
              value.initialDeposit
            );
          }
          break;
        }
        case "/cosmwasm.wasm.v1.MsgInstantiateContract": {
          const instantiateMsg = msg.unpacked as MsgInstantiateContract;
          return renderMsgInstantiateContract(
            currencies,
            instantiateMsg.funds,
            instantiateMsg.admin,
            instantiateMsg.codeId,
            instantiateMsg.label,
            JSON.parse(Buffer.from(instantiateMsg.msg).toString())
          );
        }
        case "/cosmwasm.wasm.v1.MsgExecuteContract": {
          const executeMsg = msg.unpacked as MsgExecuteContract;
          return renderMsgExecuteContract(
            currencies,
            executeMsg.funds,
            undefined,
            executeMsg.contract,
            JSON.parse(
              Buffer.from(
                Buffer.from(executeMsg.msg).toString(),
                "utf8"
              ).toString()
            )
          );
        }
        case "/cosmos.authz.v1beta1.MsgGrant": {
          const grantMsg = msg.unpacked as MsgGrant;
          switch (grantMsg.grant?.authorization?.typeUrl) {
            case "/cosmos.bank.v1beta1.SendAuthorization":
              return renderSendMsgGrant(
                currencies,
                grantMsg.grantee,
                grantMsg.grant.expiration,
                SendAuthorization.decode(grantMsg.grant.authorization.value)
              );
            case "/cosmos.staking.v1beta1.StakeAuthorization":
              return renderStakeMsgGrant(
                currencies,
                grantMsg.grantee,
                grantMsg.grant.expiration,
                StakeAuthorization.decode(grantMsg.grant.authorization.value)
              );
            default:
              return renderGenericMsgGrant(
                grantMsg.grantee,
                grantMsg.grant?.expiration,
                grantMsg.grant?.authorization?.typeUrl ===
                  "/cosmos.authz.v1beta1.GenericAuthorization"
                  ? GenericAuthorization.decode(
                      grantMsg.grant!.authorization!.value
                    ).msg
                  : grantMsg.grant!.authorization!.typeUrl
              );
          }
        }
        case "/cosmos.authz.v1beta1.MsgRevoke": {
          const revokeMsg = msg.unpacked as MsgRevoke;
          return renderMsgRevoke(revokeMsg.msgTypeUrl, revokeMsg.grantee);
        }
        case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward": {
          const withdrawMsg = msg.unpacked as MsgWithdrawDelegatorReward;
          return renderMsgWithdrawDelegatorReward(withdrawMsg.validatorAddress);
        }
        case "/cosmos.gov.v1beta1.MsgVote": {
          const voteMsg = msg.unpacked as MsgVote;
          return renderMsgVote(voteMsg.proposalId, voteMsg.option);
        }
        case "/ibc.applications.transfer.v1.MsgTransfer": {
          const transferMsg = msg.unpacked as MsgTransfer;
          if (transferMsg.token) {
            return renderMsgTransfer(
              currencies,
              transferMsg.token,
              transferMsg.receiver,
              transferMsg.sourceChannel
            );
          }
          break;
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  return renderUnknownMessage({
    typeUrl: msg.typeUrl || "Unknown",
    value: Buffer.from(msg.value).toString("base64"),
  });
}
