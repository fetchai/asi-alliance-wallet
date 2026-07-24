import React, { FunctionComponent, useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QRCode from "qrcode.react";
import style from "./style.module.scss";
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
            console.log("Fail to decrypt: " + e.message);
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
          dataLoading={true}
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

  const [qrFrames, setQRFrames] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const [isExpired, setIsExpired] = useState(false);

  const [addressBookConfigMap] = useState(
    () =>
      new AddressBookConfigMap(new ExtensionKVStore("address-book"), chainStore)
  );

  // 30-second expiry
  useEffect(() => {
    const id = setTimeout(() => {
      setIsExpired(true);

      confirm
        .confirm({
          paragraph: intl.formatMessage(
            {
              id: "setting.export-to-mobile.qr-code-view.session-expired",
            },
            {
              forceYes: true,
            }
          ),
          hideNoButton: true,
        })
        .then(() => {
          navigate("/");
        });
    }, 30000);

    return () => {
      clearTimeout(id);
    };
  }, [confirm, intl, navigate]);

  // Encrypt all keyring data + address books and split into QR frames
  useEffect(() => {
    (async () => {
      const keyBytes = new Uint8Array(32);
      crypto.getRandomValues(keyBytes);
      const key = Buffer.from(keyBytes);

      const ivBytes = new Uint8Array(16);
      crypto.getRandomValues(ivBytes);
      const iv = Buffer.from(ivBytes);

      const addressBooks: { [chainId: string]: AddressBookData[] } = {};
      for (const chainInfo of chainStore.chainInfosInUI) {
        const config = addressBookConfigMap.getAddressBookConfig(
          chainInfo.chainId
        );
        await config.waitLoaded();
        const data = toJS(config.addressBookDatas) as AddressBookData[];
        if (data.length > 0) {
          addressBooks[chainInfo.chainId] = data;
        }
      }

      const buf = Buffer.from(
        JSON.stringify({ keyRingDatas: keyRingData, addressBooks })
      );

      const counter = new Counter(0);
      counter.setBytes(iv);
      const aesCtr = new AES.ModeOfOperation.ctr(key, counter);
      const ciphertext = Buffer.from(aesCtr.encrypt(buf)).toString("hex");

      // 800 hex chars = 400 bytes per chunk keeps each QR frame under ~1100 chars
      const CHUNK_HEX = 800;
      const chunks: string[] = [];
      for (let i = 0; i < ciphertext.length; i += CHUNK_HEX) {
        chunks.push(ciphertext.slice(i, i + CHUNK_HEX));
      }

      const keyHex = key.toString("hex");
      const ivHex = iv.toString("hex");

      const frames = chunks.map((chunk, index) => {
        const frame: Record<string, unknown> = {
          type: "fetch-direct-export",
          total: chunks.length,
          index,
          data: chunk,
        };
        if (index === 0) {
          frame["key"] = keyHex;
          frame["iv"] = ivHex;
        }
        return JSON.stringify(frame);
      });

      setQRFrames(frames);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cycle through frames at 600ms each
  useEffect(() => {
    if (qrFrames.length === 0) return;
    const id = setInterval(() => {
      setCurrentFrame((f) => (f + 1) % qrFrames.length);
    }, 600);
    return () => clearInterval(id);
  }, [qrFrames]);

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

            if (qrFrames.length > 0) {
              return qrFrames[currentFrame];
            }

            return "";
          })()}
        />
        <div className={style["message"]}>
          Scan this QR code on ASI Mobile Wallet to export your accounts.
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
            <div className={style["text"]}>Only scan on ASI Mobile Wallet</div>
            <p className={style["lightText"]}>
              Scanning the QR code outside of ASI Mobile Wallet can lead to loss
              of funds
            </p>
          </div>
        </Alert>
      </div>
    </div>
  );
});
