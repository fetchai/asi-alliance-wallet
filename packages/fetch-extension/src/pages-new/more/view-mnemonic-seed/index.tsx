import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate, useLocation, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { Form } from "reactstrap";
import { useForm } from "react-hook-form";
import { WarningView } from "./warning-view";
import classnames from "classnames";
import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { flowResult } from "mobx";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { ButtonV2 } from "@components-v2/buttons/button";
import { PasswordInput } from "@components-v2/form";
import { useNotification } from "@components/notification";

interface FormData {
  password: string;
}

export const ExportPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { index = "-1 " } = useParams<{ index: string; type?: string }>();

  const intl = useIntl();
  const notification = useNotification();
  const { keyRingStore, analyticsStore } = useStore();

  const type = location.state.type ?? "mnemonic";

  const [loading, setLoading] = useState(false);
  const [keyRing, setKeyRing] = useState("");
  const [displayKeyRing, setDisplayKeyRing] = useState<string[]>([]);

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

  useEffect(() => {
    if (parseInt(index).toString() !== index) {
      throw new Error("Invalid index");
    }
  }, [index]);

  useEffect(() => {
    if (keyRing) {
      type === "mnemonic"
        ? setDisplayKeyRing(keyRing.split(" "))
        : setDisplayKeyRing([keyRing]);
    }
  }, [keyRing]);

  const copyMnemonic = useCallback(
    async (address: string) => {
      await navigator.clipboard.writeText(address);
      notification.push({
        placement: "top-center",
        type: "success",
        duration: 5,
        content: `${
          type === "mnemonic" ? "Mnemonic" : "Private key"
        } copied to clipboard!`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    },
    [notification]
  );

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      showBottomMenu={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id:
          type === "mnemonic" ? "setting.export" : "setting.export.private-key",
      })}
      onBackButton={useCallback(() => {
        analyticsStore.logEvent("back_click", {
          pageName:
            type === "mnemonic" ? "View Mnemonic Seed" : "View Private Key",
        });
        navigate(-1);
      }, [navigate])}
    >
      <div className={style["container"]}>
        {keyRing ? (
          <div
            className={classnames(style["mnemonic"], {
              [style["altHex"]]: type !== "mnemonic",
            })}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                marginBottom: "30px",
              }}
            >
              {type === "mnemonic"
                ? displayKeyRing.map((key) => (
                    <div
                      style={{
                        fontSize: "26px",
                      }}
                      key={key}
                    >
                      {key}
                    </div>
                  ))
                : displayKeyRing[0] &&
                  (type === "ledger" ? (
                    Object.keys(JSON.parse(displayKeyRing[0])).map((key) => (
                      <div
                        key={key}
                        style={{
                          marginBottom: "24px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "26px",
                            alignItems: "center",
                            marginBottom: "18px",
                          }}
                        >
                          {key}
                        </div>

                        <div
                          style={{
                            fontSize: "18px",
                            wordBreak: "break-all",
                          }}
                        >
                          {JSON.parse(displayKeyRing[0])[key]}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        fontSize: "18px",
                        wordBreak: "break-all",
                      }}
                    >
                      {displayKeyRing[0]}
                    </div>
                  ))}
            </div>
            <ButtonV2
              styleProps={{
                position: "fixed",
                bottom: "12px",
                width: "333px",
                height: "56px",
                left: "50%",
                transform: "translateX(-50%)",
              }}
              text={"Copy to clipboard"}
              onClick={() => copyMnemonic(keyRing)}
            />
          </div>
        ) : (
          <React.Fragment>
            <WarningView />
            <Form
              onSubmit={handleSubmit(async (data) => {
                setLoading(true);
                try {
                  setKeyRing(
                    await flowResult(
                      keyRingStore.showKeyRing(parseInt(index), data.password)
                    )
                  );
                } catch (e) {
                  console.log("Fail to decrypt: " + e.message);
                  setError("password", {
                    message: intl.formatMessage({
                      id: "setting.export.input.password.error.invalid",
                    }),
                  });
                } finally {
                  setLoading(false);
                }
              })}
            >
              <PasswordInput
                error={errors.password && errors.password.message}
                {...register("password", {
                  required: intl.formatMessage({
                    id: "setting.export.input.password.error.required",
                  }),
                })}
              />
              <ButtonV2
                text={
                  loading ? (
                    <i className="fas fa-spinner fa-spin ml-2" />
                  ) : (
                    <FormattedMessage id="setting.export.button.confirm" />
                  )
                }
                styleProps={{
                  height: "56px",
                }}
                data-loading={loading}
                disabled={loading}
              />
            </Form>
          </React.Fragment>
        )}
      </div>
    </HeaderLayout>
  );
});
