import React, { FunctionComponent, useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QRCode from "qrcode.react";
import style from "./style.module.scss";
import WalletConnect from "@walletconnect/client";
import { Buffer } from "buffer/";
import { Alert, Form } from "reactstrap";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { useForm } from "react-hook-form";

import { ExportKeyRingData } from "@keplr-wallet/background";
import AES, { Counter } from "aes-js";
import { AddressBookConfigMap, AddressBookData } from "@keplr-wallet/hooks";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { toJS } from "mobx";
import { useConfirm } from "@components/confirm";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Dropdown } from "@components-v2/dropdown";
import { PasswordInput } from "@components-v2/form";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { useNotification } from "@components/notification";

function safeRejectWalletConnectRequest(
  connector: WalletConnect,
  requestId: unknown,
  message: string
): void {
  if (requestId == null) {
    return;
  }
  try {
    connector.rejectRequest({
      id: requestId as number,
      error: { message },
    });
  } catch {
    // Best-effort: connector may already be closed.
  }
}

export interface QRCodeSharedData {
  // The uri for the wallet connect
  wcURI: string;
  // Session-bound identifier to prevent cross-session replay.
  sessionId: string;
  // One-time token that must be echoed by the importer.
  requestToken: string;
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

export const ExportToMobilePage: FunctionComponent = () => {
  const navigate = useNavigate();
  const intl = useIntl();
  const { analyticsStore } = useStore();

  const [exportKeyRingDatas, setExportKeyRingDatas] = useState<
    ExportKeyRingData[]
  >([]);

  const { isDropdownOpen, setIsDropdownOpen } = useDropdown();

  useEffect(() => {
    if (exportKeyRingDatas.length === 0) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  }, [exportKeyRingDatas]);
  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      showBottomMenu={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.export-to-mobile",
      })}
      onBackButton={() => {
        navigate(-1);
        analyticsStore.logEvent("back_click", {
          pageName: "Link ASI Mobile Wallet",
        });
      }}
    >
      {exportKeyRingDatas.length > 0 && (
        <QRCodeView
          keyRingData={exportKeyRingDatas}
          cancel={() => {
            setExportKeyRingDatas([]);
          }}
        />
      )}

      <Dropdown
        closeClicked={() => {
          setIsDropdownOpen(false);
          navigate("/more");
        }}
        isOpen={isDropdownOpen}
        setIsOpen={setIsDropdownOpen}
        title="Enter your password to view your QR code"
        showCloseIcon={true}
      >
        <EnterPasswordToExportKeyRingView
          onSetExportKeyRingDatas={setExportKeyRingDatas}
          setIsDropdownOpen={setIsDropdownOpen}
        />
      </Dropdown>
    </HeaderLayout>
  );
};

interface FormData {
  password: string;
}

export const EnterPasswordToExportKeyRingView: FunctionComponent<{
  onSetExportKeyRingDatas: (datas: ExportKeyRingData[]) => void;
  setIsDropdownOpen: any;
}> = observer(({ onSetExportKeyRingDatas, setIsDropdownOpen }) => {
  const { keyRingStore } = useStore();

  const intl = useIntl();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      password: "",
    },
  });
  const navigate = useNavigate();
  const notification = useNotification();
  const [loading, setLoading] = useState(false);

  return (
    <div className={style["container"]}>
      <Form
        onSubmit={handleSubmit(async (data) => {
          setLoading(true);
          try {
            const keyRingData = await keyRingStore.exportKeyRingDatas(
              data.password
            );
            if (keyRingData.length == 0) {
              notification.push({
                type: "danger",
                placement: "top-center",
                duration: 5,
                content: `The Ledger account cannot be exported`,
                canDelete: true,
                transition: {
                  duration: 0.5,
                },
              });
              setIsDropdownOpen(false);
              navigate("/more");
            }
            onSetExportKeyRingDatas(keyRingData);
          } catch (e) {
            setError("password", {
              message: intl.formatMessage({
                id: "setting.export-to-mobile.input.password.error.invalid",
              }),
            });
          } finally {
            setLoading(false);
          }
        })}
      >
        <PasswordInput
          {...register("password", {
            required: intl.formatMessage({
              id: "setting.export-to-mobile.input.password.error.required",
            }),
          })}
          error={errors.password && errors.password.message}
        />

        <ButtonV2
          text={
            loading ? (
              <i className="fas fa-spinner fa-spin ml-2" />
            ) : (
              <FormattedMessage id="setting.export-to-mobile.button.confirm" />
            )
          }
          styleProps={{
            height: "56px",
          }}
          variant="dark"
          dataLoading={loading}
          disabled={loading}
        />
      </Form>
    </div>
  );
});

const QRCodeView: FunctionComponent<{
  keyRingData: ExportKeyRingData[];

  cancel: () => void;
}> = observer(({ keyRingData, cancel }) => {
  const { chainStore } = useStore();

  const navigate = useNavigate();
  const confirm = useConfirm();
  const intl = useIntl();

  const [connector, setConnector] = useState<WalletConnect | undefined>();
  const [qrCodeData, setQRCodeData] = useState<QRCodeSharedData | undefined>();

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const [isExpired, setIsExpired] = useState(false);
  const processOnce = useRef(false);

  const [addressBookConfigMap] = useState(
    () =>
      new AddressBookConfigMap(new ExtensionKVStore("address-book"), chainStore)
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if (processOnce.current) {
        return;
      }
      // Hide qr code after 30 seconds.
      setIsExpired(true);

      confirm
        .confirm({
          paragraph: intl.formatMessage({
            id: "setting.export-to-mobile.qr-code-view.session-expired",
          }),
          yes: intl.formatMessage({
            id: "setting.export-to-mobile.qr-code-view.session-expired-cta",
          }),
          hideNoButton: true,
        })
        .then(() => {
          cancelRef.current();
        });
    }, 30000);

    return () => {
      clearTimeout(id);
    };
  }, [confirm, intl]);

  useEffect(() => {
    (async () => {
      const connector = new WalletConnect({
        bridge: "https://wc-bridge.keplr.app",
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
          navigate("/");
          return;
        }

        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const password = Buffer.from(bytes).toString("hex");
        const sessionBytes = new Uint8Array(16);
        crypto.getRandomValues(sessionBytes);
        const sessionId = Buffer.from(sessionBytes).toString("hex");
        const tokenBytes = new Uint8Array(16);
        crypto.getRandomValues(tokenBytes);
        const requestToken = Buffer.from(tokenBytes).toString("hex");

        const uri = payload.params[0] as string;
        setQRCodeData({
          wcURI: uri,
          sessionId,
          requestToken,
          sharedPassword: password,
        });
      });

      connector.createSession();
    }
  }, [connector, navigate]);

  const onConnect = (error: any) => {
    if (error) {
      navigate("/");
    }
  };
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const onCallRequest = (error: any, payload: any) => {
    if (!connector || !qrCodeData) {
      return;
    }

    const reqParams = payload?.params?.[0] ?? {};

    if (isExpired) {
      safeRejectWalletConnectRequest(
        connector,
        payload?.id,
        "Export request expired"
      );
      navigate("/");
      return;
    }

    if (error) {
      safeRejectWalletConnectRequest(
        connector,
        payload?.id,
        "Export request failed"
      );
      navigate("/");
      return;
    }

    if (
      payload.method !== "keplr_request_export_keyring_datas_wallet_connect_v1"
    ) {
      safeRejectWalletConnectRequest(
        connector,
        payload?.id,
        "Invalid export request method"
      );
      navigate("/");
      return;
    }

    const sid = reqParams.sessionId;
    const tok = reqParams.requestToken;
    const hasSid = sid !== undefined && sid !== null && String(sid).length > 0;
    const hasTok = tok !== undefined && tok !== null && String(tok).length > 0;

    let handshakeOk = false;
    if (!hasSid && !hasTok) {
      // Legacy mobile: no session-bound fields in the custom request.
      handshakeOk = true;
    } else if (hasSid && hasTok) {
      if (sid === qrCodeData.sessionId && tok === qrCodeData.requestToken) {
        handshakeOk = true;
      }
    }

    if (!handshakeOk) {
      safeRejectWalletConnectRequest(
        connector,
        payload?.id,
        "Invalid export session handshake"
      );
      navigate("/");
      return;
    }

    if (processOnce.current) {
      safeRejectWalletConnectRequest(
        connector,
        payload?.id,
        "Export already in progress"
      );
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
      let approved = false;
      try {
        const peerName = connector.peerMeta?.name || "Unknown app";
        const peerUrl = connector.peerMeta?.url || "unknown";
        const ok = await confirm.confirm({
          title: "Confirm export to connected app",
          paragraph: `Connected app: ${peerName} (${peerUrl}). Export wallet data now?`,
          yes: "Export",
          no: "Cancel",
        });

        if (!ok) {
          safeRejectWalletConnectRequest(
            connector,
            payload?.id,
            "User cancelled export"
          );
          navigate("/");
          return;
        }

        const addressBooks: {
          [chainId: string]: AddressBookData[] | undefined;
        } = {};

        if (payload.params && payload.params.length > 0) {
          for (const chainId of payload.params[0].addressBookChainIds ?? []) {
            if (typeof chainId !== "string" || !chainStore.hasChain(chainId)) {
              continue;
            }

            const addressBookConfig =
              addressBookConfigMap.getAddressBookConfig(chainId);

            await addressBookConfig.waitLoaded();

            addressBooks[chainId] = toJS(
              addressBookConfig.addressBookDatas
            ) as AddressBookData[];
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

        if (payload?.id == null) {
          navigate("/");
          return;
        }

        connector.approveRequest({
          id: payload.id,
          result: [response],
        });

        approved = true;
        navigate("/");
      } catch (e) {
        safeRejectWalletConnectRequest(
          connector,
          payload?.id,
          e instanceof Error ? e.message : "Export failed"
        );
        navigate("/");
      } finally {
        if (!approved) {
          processOnce.current = false;
        }
      }
    })();
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
          connector.killSession().catch(() => {});
        }, 5000);
      };
    }
  }, [connector]);

  return (
    <div className={style["container"]}>
      <div>
        <QRCode
          bgColor="transparent"
          fgColor="black"
          size={180}
          value={(() => {
            if (isExpired) {
              return intl.formatMessage({
                id: "setting.export-to-mobile.qr-code-view.expired",
              });
            }

            if (qrCodeData) {
              return JSON.stringify(qrCodeData);
            }

            return "";
          })()}
        />
        <div className={style["message"]}>
          <FormattedMessage id="setting.export-to-mobile.qr-code-view.message" />
        </div>
        <Alert className={style["alert"]}>
          <img src={require("@assets/svg/wireframe/alert.svg")} alt="" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div className={style["text"]}>
              <FormattedMessage id="setting.export-to-mobile.qr-code-view.warning-title" />
            </div>
            <p className={style["lightText"]}>
              <FormattedMessage id="setting.export-to-mobile.qr-code-view.warning-description" />
            </p>
          </div>
        </Alert>
      </div>
    </div>
  );
});
