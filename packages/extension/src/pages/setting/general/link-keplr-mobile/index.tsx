import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { BackButton } from "../../../../layouts/header/components";
import { HeaderLayout } from "../../../../layouts/header";
import { GuideBox } from "../../../../components/guide-box";
import { Stack } from "../../../../components/stack";
import styled from "styled-components";
import { ColorPalette } from "../../../../styles";
import { Subtitle3 } from "../../../../components/typography";
import { TextInput } from "../../../../components/input";
import lottie from "lottie-web";
import AnimScan from "../../../../public/assets/lottie/wallet/scan.json";
import { YAxis } from "../../../../components/axis";
import { useConfirm } from "../../../../hooks/confirm";
import { ExportKeyRingDataMsg, KeyRingLegacy } from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QRCode from "qrcode.react";
import { useStore } from "../../../../stores";
import WalletConnect from "@walletconnect/client";
import { useNavigate } from "react-router";
import AES, { Counter } from "aes-js";
import { AddressBookData } from "../../../../stores/ui-config/address-book";
import { toJS } from "mobx";
import { Box } from "../../../../components/box";
import { Gutter } from "../../../../components/gutter";

const Styles = {
  Container: styled(Stack)`
    padding: 0.75rem;
  `,
  Bold: styled.span`
    color: ${ColorPalette["gray-10"]};
    text-decoration: underline;
  `,
  Paragraph: styled(Subtitle3)`
    text-align: center;
    color: ${ColorPalette["gray-200"]};
    padding: 0 0.625rem;
  `,
};

export const SettingGeneralLinkKeplrMobilePage: FunctionComponent = observer(
  () => {
    const [keyRingData, setKeyRingData] = useState<
      KeyRingLegacy.ExportKeyRingData[]
    >([]);

    const confirm = useConfirm();

    return keyRingData.length === 0 ? (
      <EnterPasswordView
        onSubmit={async (password) => {
          const msg = new ExportKeyRingDataMsg(password);

          const res = await new InExtensionMessageRequester().sendMessage(
            BACKGROUND_PORT,
            msg
          );

          if (res.length === 0) {
            confirm.confirm(
              "Export Failed",
              <React.Fragment>
                You cannot export Ledger-based accounts to Keplr Mobile. These
                must be imported to your mobile device directly from the Ledger.
                <br />
                Accounts that are created via social logins that are not
                supported by Keplr Mobile cannot be exported.
              </React.Fragment>,
              {
                forceYes: true,
              }
            );
          } else {
            setKeyRingData(res);
          }
        }}
      />
    ) : (
      <QRCodeView
        keyRingData={keyRingData}
        cancel={() => {
          setKeyRingData([]);
        }}
      />
    );
  }
);

const EnterPasswordView: FunctionComponent<{
  onSubmit: (password: string) => Promise<void>;
}> = observer(({ onSubmit }) => {
  const animDivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (animDivRef.current) {
      const anim = lottie.loadAnimation({
        container: animDivRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: AnimScan,
      });

      return () => {
        anim.destroy();
      };
    }
  }, []);

  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  return (
    <HeaderLayout
      title="Link Keplr Mobile"
      left={<BackButton />}
      bottomButton={{
        color: "secondary",
        text: "Confirm",
        size: "large",
        isLoading,
        disabled: password.length === 0,
      }}
      onSubmit={async (e) => {
        e.preventDefault();

        setIsLoading(true);
        setIsFailed(false);
        try {
          await onSubmit(password);
        } catch (e) {
          console.log(e);
          setIsFailed(true);
        } finally {
          setIsLoading(false);
        }
      }}
    >
      <Styles.Container gutter="0.75rem">
        <GuideBox
          title="Only scan on Keplr Mobile"
          paragraph={
            <div>
              Scanning the QR code outside of Keplr Mobile can lead to loss of
              funds
            </div>
          }
        />

        <YAxis alignX="center">
          <div
            ref={animDivRef}
            style={{
              backgroundColor: ColorPalette["gray-600"],
              borderRadius: "2.5rem",
              width: "9.375rem",
              height: "9.375rem",
            }}
          />
        </YAxis>

        <Styles.Paragraph>
          Scan QR code to export accounts to Keplr Mobile. The process may take
          several minutes.
        </Styles.Paragraph>

        <TextInput
          label="Password"
          type="password"
          value={password}
          error={isFailed ? "Invalid password" : undefined}
          onChange={(e) => {
            e.preventDefault();

            setPassword(e.target.value);

            // Clear error if the user is typing.
            setIsFailed(false);
          }}
        />
      </Styles.Container>
    </HeaderLayout>
  );
});

export interface QRCodeSharedData {
  // The uri for the wallet connect
  wcURI: string;
  // The temporary password for encrypt/descrypt the key datas.
  // This must not be shared the other than the extension and mobile.
  sharedPassword: string;
}

export interface WCExportKeyRingDatasResponse {
  encrypted: {
    // ExportKeyRingData[]
    // Json format and hex encoded
    ciphertext: string;
    // Hex encoded
    iv: string;
  };
  addressBooks: { [chainId: string]: AddressBookData[] | undefined };
}

const QRCodeView: FunctionComponent<{
  keyRingData: KeyRingLegacy.ExportKeyRingData[];

  cancel: () => void;
}> = observer(({ keyRingData, cancel }) => {
  const { uiConfigStore } = useStore();

  const navigate = useNavigate();
  const confirm = useConfirm();

  const [connector, setConnector] = useState<WalletConnect | undefined>();
  const [qrCodeData, setQRCodeData] = useState<QRCodeSharedData | undefined>();

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const [isExpired, setIsExpired] = useState(false);
  const processOnce = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (processOnce.current) {
        return;
      }
      // Hide qr code after 30 seconds.
      setIsExpired(true);
      confirm
        .confirm("", "Session expired", {
          forceYes: true,
        })
        .then(() => {
          cancelRef.current();
        });
    }, 30000);

    return () => {
      clearTimeout(id);
    };
  }, [confirm]);

  useEffect(() => {
    (async () => {
      const connector = new WalletConnect({
        bridge: "https://bridge.walletconnect.org",
      });

      if (connector.connected) {
        await connector.killSession();
      }

      setConnector(connector);
    })();
  }, []);

  useEffect(() => {
    if (connector) {
      connector.on("display_uri", (error, payload) => {
        if (error) {
          console.log(error);
          navigate("/");
          return;
        }

        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const password = Buffer.from(bytes).toString("hex");

        const uri = payload.params[0] as string;
        setQRCodeData({
          wcURI: uri,
          sharedPassword: password,
        });
      });

      connector.createSession();
    }
  }, [connector, navigate]);

  const onConnect = (error: any) => {
    if (error) {
      console.log(error);
      navigate("/");
    }
  };
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const onCallRequest = (error: any, payload: any) => {
    if (!connector || !qrCodeData) {
      return;
    }

    if (
      isExpired ||
      error ||
      payload.method !== "keplr_request_export_keyring_datas_wallet_connect_v1"
    ) {
      console.log(error, payload?.method);
      navigate("/");
    } else {
      if (processOnce.current) {
        return;
      }
      processOnce.current = true;

      const buf = Buffer.from(JSON.stringify(keyRingData));

      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const iv = Buffer.from(bytes);

      const counter = new Counter(0);
      counter.setBytes(iv);
      const aesCtr = new AES.ModeOfOperation.ctr(
        Buffer.from(qrCodeData.sharedPassword, "hex"),
        counter
      );

      (async () => {
        const addressBooks: {
          [chainId: string]: AddressBookData[] | undefined;
        } = {};

        if (payload.params && payload.params.length > 0) {
          for (const chainId of payload.params[0].addressBookChainIds ?? []) {
            const addressBookData =
              uiConfigStore.addressBookConfig.getAddressBook(chainId);

            addressBooks[chainId] = toJS(addressBookData);
          }
        }

        const response: WCExportKeyRingDatasResponse = {
          encrypted: {
            ciphertext: Buffer.from(aesCtr.encrypt(buf)).toString("hex"),
            // Hex encoded
            iv: iv.toString("hex"),
          },
          addressBooks,
        };

        connector.approveRequest({
          id: payload.id,
          result: [response],
        });

        navigate("/");
      })();
    }
  };
  const onCallRequestRef = useRef(onCallRequest);
  onCallRequestRef.current = onCallRequest;

  useEffect(() => {
    if (connector && qrCodeData) {
      connector.on("connect", (error) => {
        onConnectRef.current(error);
      });

      connector.on("call_request", (error, payload) => {
        onCallRequestRef.current(error, payload);
      });
    }
  }, [connector, qrCodeData]);

  useEffect(() => {
    if (connector) {
      return () => {
        // Kill session after 5 seconds.
        // Delay is needed because it is possible for wc to being processing the request.
        setTimeout(() => {
          connector.killSession().catch(console.log);
        }, 5000);
      };
    }
  }, [connector]);

  return (
    <HeaderLayout title="Link Keplr Mobile" left={<BackButton />}>
      <Styles.Container>
        <Box padding="1.5rem">
          <YAxis alignX="center">
            <Styles.Paragraph>
              Scan the QR code to sync with Keplr Mobile. The process may take
              several minutes.
            </Styles.Paragraph>
            <Gutter size="3.375rem" direction="vertical" />
            <Box
              padding="1rem"
              borderRadius="0.5rem"
              backgroundColor={ColorPalette["white"]}
            >
              <QRCode
                size={180}
                value={(() => {
                  if (isExpired) {
                    return "Expired";
                  }

                  if (qrCodeData) {
                    return JSON.stringify(qrCodeData);
                  }

                  return "";
                })()}
              />
            </Box>
          </YAxis>
        </Box>
      </Styles.Container>
    </HeaderLayout>
  );
});
