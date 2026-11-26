import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { CoinUtils, Coin } from "@keplr-wallet/unit";
import { AppCurrency, Currency } from "@keplr-wallet/types";
import yaml from "js-yaml";
import { CoinPrimitive } from "@keplr-wallet/stores";
import { Text, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Bech32Address } from "@keplr-wallet/cosmos";
import Hypher from "hypher";
import english from "hyphenation.en-us";
import { useStore } from "stores/index";
import { Buffer } from "buffer/";
import { observer } from "mobx-react-lite";
import { Grant } from "@keplr-wallet/proto-types/cosmos/authz/v1beta1/authz";
import {
  AuthorizationType,
  StakeAuthorization,
} from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/authz";
import { SendAuthorization } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/authz";

const h = new Hypher(english);

// https://zpl.fi/hyphenation-in-react-native/
function hyphen(text: string): string {
  return h.hyphenateText(text);
}

export interface MessageObj {
  readonly type: string;
  readonly value: unknown;
}

export interface MsgSend {
  value: {
    amount: [
      {
        amount: string;
        denom: string;
      }
    ];
    from_address: string;
    to_address: string;
  };
}

export interface MsgTransfer {
  value: {
    source_port: string;
    source_channel: string;
    token: {
      denom: string;
      amount: string;
    };
    sender: string;
    receiver: string;
    timeout_height: {
      revision_number: string | undefined;
      revision_height: string;
    };
  };
}

export interface MsgDelegate {
  value: {
    amount: {
      amount: string;
      denom: string;
    };
    delegator_address: string;
    validator_address: string;
  };
}

export interface MsgUndelegate {
  value: {
    amount: {
      amount: string;
      denom: string;
    };
    delegator_address: string;
    validator_address: string;
  };
}

export interface MsgWithdrawDelegatorReward {
  value: {
    delegator_address: string;
    validator_address: string;
  };
}

export interface MsgBeginRedelegate {
  value: {
    amount: {
      amount: string;
      denom: string;
    };
    delegator_address: string;
    validator_dst_address: string;
    validator_src_address: string;
  };
}

export interface MsgVote {
  value: {
    proposal_id: string;
    voter: string;
    // In the stargate, option would be the enum (0: empty, 1: yes, 2: abstain, 3: no, 4: no with veto).
    option: string | number;
  };
}

export interface MsgSubmitProposal {
  value: {
    content: any;
    initial_deposit: CoinPrimitive[];
    proposer: string;
  };
}

export interface MsgInstantiateContract {
  value: {
    // Admin field can be omitted.
    admin?: string;
    sender: string;
    code_id: string;
    label: string;
    init_msg: object;
    init_funds: [
      {
        amount: string;
        denom: string;
      }
    ];
  };
}

// This message can be a normal cosmwasm message or a secret-wasm message.
export interface MsgExecuteContract {
  value: {
    contract: string;
    // If message is for secret-wasm, msg will be the base64 encoded and encrypted string.
    msg: object | string;
    sender: string;
    // The field is for wasm message.
    funds?: [
      {
        amount: string;
        denom: string;
      }
    ];
    // The bottom fields are for secret-wasm message.
    sent_funds?: [
      {
        amount: string;
        denom: string;
      }
    ];
    callback_code_hash?: string;
    callback_sig?: string | null;
  };
}

export interface MsgLink {
  value: {
    links: [
      {
        from: string;
        to: string;
      }
    ];
    neuron: string;
  };
}

export function renderUnknownMessage(msg: object) {
  return {
    icon: undefined,
    title: "Custom",
    content: <UnknownMsgView msg={msg} />,
    scrollViewHorizontal: true,
  };
}

export function renderMsgSend(
  currencies: AppCurrency[],
  amount: CoinPrimitive[],
  toAddress: string
) {
  const receives: CoinPrimitive[] = [];
  for (const coinPrimitive of amount) {
    const coin = new Coin(coinPrimitive.denom, coinPrimitive.amount);
    const parsed = CoinUtils.parseDecAndDenomFromCoin(currencies, coin);

    receives.push({
      amount: clearDecimals(parsed.amount),
      denom: parsed.denom,
    });
  }

  return {
    title: "Send",
    content: (
      <Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(toAddress, 20))}
        </Text>
        <Text>{" will receive "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(
            receives
              .map((coin) => {
                return `${coin.amount} ${coin.denom}`;
              })
              .join(",")
          )}
        </Text>
      </Text>
    ),
  };
}

export function renderMsgTransfer(
  currencies: AppCurrency[],
  amount: CoinPrimitive,
  receiver: string,
  channelId: string
) {
  const coin = new Coin(amount.denom, amount.amount);
  const parsed = CoinUtils.parseDecAndDenomFromCoin(currencies, coin);

  amount = {
    amount: clearDecimals(parsed.amount),
    denom: parsed.denom,
  };

  return {
    title: "IBC Transfer",
    content: (
      <Text>
        <Text>{"Send "}</Text>
        <Text
          style={{
            fontWeight: "bold",
          }}
        >
          {hyphen(`${amount.amount} ${amount.denom}`)}
        </Text>
        <Text>{" to "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(receiver, 20))}
        </Text>
        <Text>{" on "}</Text>
        <Text style={{ fontWeight: "bold" }}>{channelId}</Text>
      </Text>
    ),
  };
}

export function renderMsgBeginRedelegate(
  currencies: AppCurrency[],
  amount: CoinPrimitive,
  validatorSrcAddress: string,
  validatorDstAddress: string
) {
  const parsed = CoinUtils.parseDecAndDenomFromCoin(
    currencies,
    new Coin(amount.denom, amount.amount)
  );

  amount = {
    amount: clearDecimals(parsed.amount),
    denom: parsed.denom,
  };

  return {
    title: "Switch Validator",
    content: (
      <Text>
        <Text>{"Switch validator "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(`${amount.amount} ${amount.denom}`)}
        </Text>
        <Text>{" from "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(validatorSrcAddress, 24))}
        </Text>
        <Text>{" to "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(validatorDstAddress, 24))}
        </Text>
      </Text>
    ),
  };
}

export function renderMsgUndelegate(
  currencies: AppCurrency[],
  amount: CoinPrimitive,
  validatorAddress: string
) {
  const parsed = CoinUtils.parseDecAndDenomFromCoin(
    currencies,
    new Coin(amount.denom, amount.amount)
  );

  amount = {
    amount: clearDecimals(parsed.amount),
    denom: parsed.denom,
  };

  return {
    title: "Unstake",
    content: (
      <Text>
        <Text>{"Unstake "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(`${amount.amount} ${amount.denom}`)}
        </Text>
        <Text>{" from "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(validatorAddress, 24))}
        </Text>
        <Text>{`\n${hyphen(
          "Asset will be liquid after unbonding period"
        )}`}</Text>
      </Text>
    ),
  };
}

export function renderMsgDelegate(
  currencies: AppCurrency[],
  amount: CoinPrimitive,
  validatorAddress: string
) {
  const parsed = CoinUtils.parseDecAndDenomFromCoin(
    currencies,
    new Coin(amount.denom, amount.amount)
  );

  amount = {
    amount: clearDecimals(parsed.amount),
    denom: parsed.denom,
  };

  return {
    title: "Stake",
    content: (
      <Text>
        <Text>{"Stake "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(`${amount.amount} ${amount.denom}`)}
        </Text>
        <Text>{" to "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(validatorAddress, 24))}
        </Text>
      </Text>
    ),
  };
}

export function renderMsgWithdrawDelegatorReward(validatorAddress: string) {
  return {
    title: "Claim Staking Reward",
    content: (
      <Text>
        <Text>{"Claim pending staking reward from "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(validatorAddress, 34))}
        </Text>
      </Text>
    ),
  };
}

export function renderMsgVote(proposalId: string, option: string | number) {
  const textualOption = (() => {
    if (typeof option === "string") {
      return option;
    }

    switch (option) {
      case 0:
        return "Empty";
      case 1:
        return "Yes";
      case 2:
        return "Abstain";
      case 3:
        return "No";
      case 4:
        return "No with veto";
      default:
        return "Unspecified";
    }
  })();

  // Vote <b>{option}</b> on <b>Proposal {id}</b>

  return {
    title: "Vote",
    content: (
      <Text>
        <Text>{"Vote "}</Text>
        <Text style={{ fontWeight: "bold" }}>{textualOption}</Text>
        <Text>{" on "}</Text>
        <Text style={{ fontWeight: "bold" }}>{`Proposal ${proposalId}`}</Text>
      </Text>
    ),
  };
}

export function renderMsgSubmitProposal(
  proposer: string,
  content: any,
  initialDeposit: CoinPrimitive[] | undefined
) {
  const proposalTitle = content?.value?.title || content?.title;
  const proposalType = (
    content?.type?.split("/").pop() || content?.["@type"]?.split(".").pop()
  )
    ?.replace(/([A-Z])/g, " $1")
    .trim();

  return {
    title: proposalTitle || "Submit Proposal",
    content: (
      <Text>
        <Text>{"Proposer: "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(proposer, 24))}
        </Text>
        <Text>{`\nType: `}</Text>
        <Text style={{ fontWeight: "bold" }}>{proposalType || "Proposal"}</Text>
        {initialDeposit && initialDeposit.length > 0 ? (
          <Text>{`\nDeposit: ${initialDeposit
            .map((d) => `${d.amount} ${d.denom}`)
            .join(", ")}`}</Text>
        ) : null}
        <Text>{`\n${JSON.stringify(content, null, 2)}`}</Text>
      </Text>
    ),
    scrollViewHorizontal: true,
  };
}

export function renderMsgInstantiateContract(
  currencies: AppCurrency[],
  initFunds: CoinPrimitive[],
  admin: string | undefined,
  codeId: string,
  label: string,
  initMsg: object
) {
  const funds: { amount: string; denom: string }[] = [];
  for (const coinPrimitive of initFunds) {
    const coin = new Coin(coinPrimitive.denom, coinPrimitive.amount);
    const parsed = CoinUtils.parseDecAndDenomFromCoin(currencies, coin);
    funds.push({
      amount: clearDecimals(parsed.amount),
      denom: parsed.denom,
    });
  }

  return {
    title: "Instantiate Contract",
    content: (
      <Text>
        <Text>{"Code ID: "}</Text>
        <Text style={{ fontWeight: "bold" }}>{codeId}</Text>
        <Text>{`\nLabel: `}</Text>
        <Text style={{ fontWeight: "bold" }}>{label}</Text>
        {admin ? (
          <Text>
            <Text>{`\nAdmin: `}</Text>
            <Text style={{ fontWeight: "bold" }}>
              {Bech32Address.shortenAddress(admin, 30)}
            </Text>
          </Text>
        ) : null}
        {funds.length > 0 ? (
          <Text>
            <Text>{`\nFunds: `}</Text>
            <Text style={{ fontWeight: "bold" }}>
              {funds.map((c) => `${c.amount} ${c.denom}`).join(", ")}
            </Text>
          </Text>
        ) : null}
        <WasmExecutionMsgView msg={initMsg} />
      </Text>
    ),
    scrollViewHorizontal: true,
  };
}

export function renderGenericMsgGrant(
  granteeAddress: string,
  expiration: Grant["expiration"],
  grantTypeUrl: string
) {
  return {
    title: "Grant Authorization",
    content: (
      <Text>
        <Text>{"Grantee: "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(granteeAddress, 24))}
        </Text>
        <Text>{`\nGrant type: `}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {grantTypeUrl ? grantTypeUrl.split(".").slice(-1)[0] : "Unspecified"}
        </Text>
        {expiration ? (
          <Text>{`\nExpires: ${expiration.toLocaleDateString()}`}</Text>
        ) : null}
      </Text>
    ),
  };
}

const stakingAuthorizationTypeLabels: Record<AuthorizationType, string> = {
  [AuthorizationType.AUTHORIZATION_TYPE_DELEGATE]: "Delegate",
  [AuthorizationType.AUTHORIZATION_TYPE_REDELEGATE]: "Redelegate",
  [AuthorizationType.AUTHORIZATION_TYPE_UNDELEGATE]: "Undelegate",
  [AuthorizationType.AUTHORIZATION_TYPE_UNSPECIFIED]: "Unspecified",
  [AuthorizationType.UNRECOGNIZED]: "Unrecognized",
};

export function renderStakeMsgGrant(
  currencies: AppCurrency[],
  grantee: string,
  expiration: Grant["expiration"],
  stakingSettings: StakeAuthorization
) {
  const parsedMaxAmount =
    stakingSettings.maxTokens &&
    CoinUtils.parseDecAndDenomFromCoin(
      currencies,
      new Coin(
        stakingSettings.maxTokens.denom,
        stakingSettings.maxTokens.amount
      )
    );
  const grantTypeStr =
    stakingAuthorizationTypeLabels[stakingSettings.authorizationType] ||
    "Unknown";
  const validators =
    stakingSettings.allowList?.address ||
    stakingSettings.denyList?.address ||
    [];
  const validatorListType = stakingSettings.allowList?.address?.length
    ? "Allowed validators"
    : "Denied validators";

  return {
    title: "Grant Authorization",
    content: (
      <Text>
        <Text>{"Grantee: "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(grantee, 24))}
        </Text>
        <Text>{`\nGrant type: `}</Text>
        <Text style={{ fontWeight: "bold" }}>{grantTypeStr}</Text>
        {validators.length > 0 ? (
          <Text>
            <Text>{`\n${validatorListType}: `}</Text>
            <Text style={{ fontWeight: "bold" }}>
              {validators
                .map((a) => Bech32Address.shortenAddress(a, 24))
                .join(", ")}
            </Text>
          </Text>
        ) : null}
        <Text>{`\nMax amount: `}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {parsedMaxAmount
            ? `${clearDecimals(parsedMaxAmount.amount)} ${
                parsedMaxAmount.denom
              }`
            : "Unlimited"}
        </Text>
        {expiration ? (
          <Text>{`\nExpires: ${expiration.toLocaleDateString()}`}</Text>
        ) : null}
      </Text>
    ),
  };
}

export function renderSendMsgGrant(
  currencies: AppCurrency[],
  granteeAddress: string,
  expiration: Grant["expiration"],
  sendSettings: SendAuthorization
) {
  const spendLimit =
    sendSettings.spendLimit
      ?.map((amount) =>
        CoinUtils.parseDecAndDenomFromCoin(
          currencies,
          new Coin(amount.denom, amount.amount)
        )
      )
      ?.map((coin) => `${clearDecimals(coin.amount)} ${coin.denom}`)
      .join(", ") || "Unlimited";

  return {
    title: "Grant Authorization",
    content: (
      <Text>
        <Text>{"Grantee: "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(granteeAddress, 24))}
        </Text>
        <Text>{`\nMax send amount: `}</Text>
        <Text style={{ fontWeight: "bold" }}>{spendLimit}</Text>
        {expiration ? (
          <Text>{`\nExpires: ${expiration.toLocaleDateString()}`}</Text>
        ) : null}
      </Text>
    ),
  };
}

export function renderMsgRevoke(revokeType: string, granteeAddress: string) {
  return {
    title: "Revoke Authorization",
    content: (
      <Text>
        <Text>{"Revoke: "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {revokeType.split(".").slice(-1)[0]}
        </Text>
        <Text>{" from "}</Text>
        <Text style={{ fontWeight: "bold" }}>
          {hyphen(Bech32Address.shortenAddress(granteeAddress, 24))}
        </Text>
      </Text>
    ),
  };
}

export function renderMsgExecuteContract(
  currencies: Currency[],
  sentFunds: CoinPrimitive[],
  _callbackCodeHash: string | undefined,
  contract: string,
  msg: object | string
) {
  const sent: { amount: string; denom: string }[] = [];
  for (const coinPrimitive of sentFunds) {
    const coin = new Coin(coinPrimitive.denom, coinPrimitive.amount);
    const parsed = CoinUtils.parseDecAndDenomFromCoin(currencies, coin);

    sent.push({
      amount: clearDecimals(parsed.amount),
      denom: parsed.denom,
    });
  }

  // const isSecretWasm = callbackCodeHash != null;

  return {
    icon: "fas fa-cog",
    title: "Execute Wasm Contract",
    content: (
      <Text>
        <Text>
          <Text>Execute contract </Text>
          <Text style={{ fontWeight: "bold" }}>
            {Bech32Address.shortenAddress(contract, 26)}
          </Text>
          {sent.length > 0 ? (
            <Text>
              <Text> by sending </Text>
              <Text style={{ fontWeight: "bold" }}>
                {sent
                  .map((coin) => {
                    return `${coin.amount} ${coin.denom}`;
                  })
                  .join(",")}
              </Text>
            </Text>
          ) : undefined}
        </Text>
        {/* TODO: Add secret wasm badge */}
        {/*isSecretWasm ? (
          <React.Fragment>
            <br />
            <Badge
              color="primary"
              pill
              style={{ marginTop: "6px", marginBottom: "6px" }}
            >
              <FormattedMessage id="sign.list.message.wasm/MsgExecuteContract.content.badge.secret-wasm" />
            </Badge>
          </React.Fragment>
        ) : (
          <br />
        )*/}
        <WasmExecutionMsgView msg={msg} />
      </Text>
    ),
  };
}

export const WasmExecutionMsgView: FunctionComponent<{
  msg: object | string;
}> = observer(({ msg }) => {
  const { chainStore, accountStore } = useStore();

  const style = useStyle();

  const [isOpen, setIsOpen] = useState(true);

  const [detailsMsg, setDetailsMsg] = useState(() =>
    JSON.stringify(msg, null, 2)
  );
  const [warningMsg, setWarningMsg] = useState("");

  useEffect(() => {
    // If msg is string, it will be the message for secret-wasm.
    // So, try to decrypt.
    // But, if this msg is not encrypted via Keplr, Keplr cannot decrypt it.
    // TODO: Handle the error case. If an error occurs, rather than rejecting the signing, it informs the user that Keplr cannot decrypt it and allows the user to choose.
    if (typeof msg === "string") {
      (async () => {
        try {
          let cipherText = Buffer.from(Buffer.from(msg, "base64"));
          // Msg is start with 32 bytes nonce and 32 bytes public key.
          const nonce = cipherText.slice(0, 32);
          cipherText = cipherText.slice(64);

          const keplr = await accountStore
            .getAccount(chainStore.current.chainId)
            .getKeplr();
          if (!keplr) {
            throw new Error("Can't get the keplr API");
          }

          const enigmaUtils = keplr.getEnigmaUtils(chainStore.current.chainId);
          let plainText = Buffer.from(
            await enigmaUtils.decrypt(cipherText, nonce)
          );
          // Remove the contract code hash.
          plainText = plainText.slice(64);

          setDetailsMsg(
            JSON.stringify(JSON.parse(plainText.toString()), null, 2)
          );
          setWarningMsg("");
        } catch {
          setWarningMsg(
            "Failed to decrypt Secret message. This may be due to Keplr viewing key not matching the transaction viewing key."
          );
        }
      })();
    }
  }, [accountStore, chainStore, chainStore.current.chainId, msg]);

  return (
    <Text style={style.flatten(["margin-top-8"]) as ViewStyle}>
      {isOpen ? (
        <React.Fragment>
          <Text>{`\n${detailsMsg}`}</Text>
          {warningMsg ? (
            <Text style={style.flatten(["color-red-200"]) as ViewStyle}>
              {warningMsg}
            </Text>
          ) : null}
        </React.Fragment>
      ) : null}
      <Text
        onPress={() => setIsOpen(!isOpen)}
        style={style.flatten(["text-caption2", "color-gray-300"]) as ViewStyle}
      >
        {isOpen ? "\nClose" : "\nDetails"}
      </Text>
    </Text>
  );
});

/*
export function renderMsgInstantiateContract(
  currencies: Currency[],
  intl: IntlShape,
  initFunds: CoinPrimitive[],
  admin: string | undefined,
  codeId: string,
  label: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  initMsg: object
) {
  const funds: { amount: string; denom: string }[] = [];
  for (const coinPrimitive of initFunds) {
    const coin = new Coin(coinPrimitive.denom, coinPrimitive.amount);
    const parsed = CoinUtils.parseDecAndDenomFromCoin(currencies, coin);

    funds.push({
      amount: clearDecimals(parsed.amount),
      denom: parsed.denom,
    });
  }

  return {
    icon: "fas fa-cog",
    title: intl.formatMessage({
      id: "sign.list.message.wasm/MsgInstantiateContract.title",
    }),
    content: (
      <React.Fragment>
        <FormattedMessage
          id="sign.list.message.wasm/MsgInstantiateContract.content"
          values={{
            b: (...chunks: any[]) => <b>{chunks}</b>,
            br: <br />,
            admin: admin ? Bech32Address.shortenAddress(admin, 30) : "",
            ["only-admin-exist"]: (...chunks: any[]) => (admin ? chunks : ""),
            codeId: codeId,
            label: label,
            ["only-funds-exist"]: (...chunks: any[]) =>
              funds.length > 0 ? chunks : "",
            funds: funds
              .map((coin) => {
                return `${coin.amount} ${coin.denom}`;
              })
              .join(","),
          }}
        />
        <br />
        <WasmExecutionMsgView msg={initMsg} />
      </React.Fragment>
    ),
  };
}

export const WasmExecutionMsgView: FunctionComponent<{
  // eslint-disable-next-line @typescript-eslint/ban-types
  msg: object | string;
}> = observer(({ msg }) => {
  const { chainStore, accountStore } = useStore();

  const [isOpen, setIsOpen] = useState(true);
  const intl = useIntl();

  const toggleOpen = () => setIsOpen((isOpen) => !isOpen);

  const [detailsMsg, setDetailsMsg] = useState(() =>
    JSON.stringify(msg, null, 2)
  );
  const [warningMsg, setWarningMsg] = useState("");

  useEffect(() => {
    // If msg is string, it will be the message for secret-wasm.
    // So, try to decrypt.
    // But, if this msg is not encrypted via Keplr, Keplr cannot decrypt it.
    // TODO: Handle the error case. If an error occurs, rather than rejecting the signing, it informs the user that Kepler cannot decrypt it and allows the user to choose.
    if (typeof msg === "string") {
      (async () => {
        try {
          let cipherText = Buffer.from(Buffer.from(msg, "base64"));
          // Msg is start with 32 bytes nonce and 32 bytes public key.
          const nonce = cipherText.slice(0, 32);
          cipherText = cipherText.slice(64);

          const keplr = await accountStore
            .getAccount(chainStore.current.chainId)
            .getKeplr();
          if (!keplr) {
            throw new Error("Can't get the keplr API");
          }

          const enigmaUtils = keplr.getEnigmaUtils(chainStore.current.chainId);
          let plainText = Buffer.from(
            await enigmaUtils.decrypt(cipherText, nonce)
          );
          // Remove the contract code hash.
          plainText = plainText.slice(64);

          setDetailsMsg(
            JSON.stringify(JSON.parse(plainText.toString()), null, 2)
          );
          setWarningMsg("");
        } catch {
          setWarningMsg(
            intl.formatMessage({
              id:
                "sign.list.message.wasm/MsgExecuteContract.content.warning.secret-wasm.failed-decryption",
            })
          );
        }
      })();
    }
  }, [chainStore, chainStore.current.chainId, intl, msg]);

  return (
    <div>
      {isOpen ? (
        <React.Fragment>
          <pre style={{ width: "280px" }}>{isOpen ? detailsMsg : ""}</pre>
          {warningMsg ? <div>{warningMsg}</div> : null}
        </React.Fragment>
      ) : null}
      <Button
        size="sm"
        style={{ float: "right", marginRight: "6px" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          toggleOpen();
        }}
      >
        {isOpen
          ? intl.formatMessage({
              id: "sign.list.message.wasm.button.close",
            })
          : intl.formatMessage({
              id: "sign.list.message.wasm.button.details",
            })}
      </Button>
    </div>
  );
});
 */

export const UnknownMsgView: FunctionComponent<{ msg: object }> = ({ msg }) => {
  const style = useStyle();

  const prettyMsg = useMemo(() => {
    try {
      return yaml.dump(msg);
    } catch (e) {
      console.log(e);
      return "Failed to decode the msg";
    }
  }, [msg]);

  return (
    <Text style={style.flatten(["body3", "color-text-low"]) as ViewStyle}>
      {prettyMsg}
    </Text>
  );
};

export function clearDecimals(dec: string): string {
  if (!dec.includes(".")) {
    return dec;
  }

  for (let i = dec.length - 1; i >= 0; i--) {
    if (dec[i] === "0") {
      dec = dec.slice(0, dec.length - 1);
    } else {
      break;
    }
  }
  if (dec.length > 0 && dec[dec.length - 1] === ".") {
    dec = dec.slice(0, dec.length - 1);
  }

  return dec;
}
