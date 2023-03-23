import { ContextProps } from "@components/notification";
import { cosmos } from "@keplr-wallet/cosmos";
import { AccountWithAll, getKeplrFromWindow } from "@keplr-wallet/stores";
import ICoin = cosmos.base.v1beta1.ICoin;

//currently not in use
export const signTransaction = async (
  data: string,
  chainId: string,
  address: string
) => {
  const payload = JSON.parse(data);
  const msg = {
    chain_id: chainId,
    account_number: payload.account_number,
    msgs: payload.body.messages,
    sequence: payload.sequence,
    fee: {
      gas: "96000",
      amount: [
        {
          denom: "atestfet",
          amount: "480000000000000",
        },
      ],
    },
    memo: "",
  };
  //sendTx
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const keplr = (await getKeplrFromWindow())!;
  const signResponse = await keplr.signAmino(chainId, address, msg, {
    preferNoSetFee: false,
    preferNoSetMemo: true,
    disableBalanceCheck: true,
  });
  const signedTx = cosmos.tx.v1beta1.TxRaw.encode({
    bodyBytes: cosmos.tx.v1beta1.TxBody.encode({
      messages: payload.body.messages,
      memo: signResponse.signed.memo,
    }).finish(),
    authInfoBytes: cosmos.tx.v1beta1.AuthInfo.encode({
      signerInfos: [
        {
          publicKey: {
            type_url: "/cosmos.crypto.secp256k1.PubKey",
            value: cosmos.crypto.secp256k1.PubKey.encode({
              key: Buffer.from(signResponse.signature.pub_key.value, "base64"),
            }).finish(),
          },
          modeInfo: payload.authInfo.signerInfos[0].modeInfo,
          sequence: payload.sequence,
        },
      ],
      fee: {
        amount: signResponse.signed.fee.amount as ICoin[],
        gasLimit: payload.sequence,
      },
    }).finish(),
    signatures: [Buffer.from(signResponse.signature.signature, "base64")],
  }).finish();
  // console.log("signedTx", signedTx);
  // const txHash = await keplr.sendTx(
  //   current.chainId,
  //   signedTx,
  //   "async" as BroadcastMode
  // );
  // console.log("txHash", txHash);

  return {
    ...signResponse,
    signedTx,
    message: "Transaction Signed",
  };
};

//currently in use
export const executeTxn = async (
  accountInfo: AccountWithAll,
  payload: any,
  notification: ContextProps
) => {
  let txnResponse = null;
  switch (payload.method) {
    case "sendToken":
      txnResponse = await sendToken(accountInfo, payload, notification);
      break;
    case "claimRewards":
      txnResponse = await claimRewards(accountInfo, payload, notification);
      break;
  }
  return txnResponse;
};

export const claimRewards = async (
  accountInfo: AccountWithAll,
  data: any,
  notification: ContextProps
) => {
  const txnResponse = await accountInfo.cosmos.sendWithdrawDelegationRewardMsgs(
    data.validatorAddresses,
    "",
    {
      gas: "190000",
      amount: [
        {
          denom: "atestfet",
          amount: "950000000000000",
        },
      ],
    },
    { disableBalanceCheck: false },
    {
      onBroadcasted: (_txHash: Uint8Array) => {
        notification.push({
          type: "success",
          placement: "top-center",
          duration: 5,
          content: `Transaction broadcasted`,
          canDelete: true,
          transition: {
            duration: 0.25,
          },
        });
      },
    }
  );
  return txnResponse;
};

export const sendToken = async (
  accountInfo: AccountWithAll,
  data: any,
  notification: ContextProps
) => {
  const txnResponse = await accountInfo.sendToken(
    data.amount,
    data.currency,
    data.recipientAddress,
    "",
    {
      gas: "96000",
      amount: [
        {
          denom: "atestfet",
          amount: "480000000000000",
        },
      ],
    },
    { disableBalanceCheck: false },
    {
      onBroadcasted: (_txHash: Uint8Array) => {
        notification.push({
          type: "success",
          placement: "top-center",
          duration: 5,
          content: `Transaction broadcasted`,
          canDelete: true,
          transition: {
            duration: 0.25,
          },
        });
      },
    }
  );
  return txnResponse;
};

//example JSONS
//transferFET
export const data1 = {
  amount: "0.1",
  method: "sendToken",
  currency: {
    coinDenom: "TESTFET",
    coinMinimalDenom: "atestfet",
    coinDecimals: 18,
  },
  reciepientAddress: "asdfd",
};

//sendToken
export const data2 = {
  amount: "0.1",
  method: "sendToken",
  currency: {
    type: "cw20",
    contractAddress: "dsfdfgb",
  },
  reciepientAddress: "asdfd",
};

// claimRewards
export const data3 = {
  method: "claimRewards",
  validatorAddresses: [""],
  memo: "",
};
