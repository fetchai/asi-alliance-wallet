import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate, useParams } from "react-router";
import { Alert, Form } from "reactstrap";

import { PasswordInput } from "@components-v2/form";
import style from "./delete.module.scss";
import { useForm } from "react-hook-form";
import { FormattedMessage, useIntl } from "react-intl";

import { useStore } from "../../../stores";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { ButtonV2 } from "@components-v2/buttons/button";
import { DeleteDescription } from "./delete-description";
import { Dropdown } from "@components-v2/dropdown";

interface FormData {
  password: string;
}

export const DeleteWallet: FunctionComponent = () => {
  const navigate = useNavigate();
  const intl = useIntl();

  const { index = "-1 " } = useParams<{ index: string }>();

  const [loading, setLoading] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const { keyRingStore, analyticsStore } = useStore();
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

  const keyStore = useMemo(() => {
    return keyRingStore.multiKeyStoreInfo[parseInt(index)];
  }, [keyRingStore.multiKeyStoreInfo, index]);

  const onBackUpMnemonicButtonClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      analyticsStore.logEvent("back_up_mnemonic_seed_click", {
        pageName: "Home",
      });
      navigate(`/more/export/${index}`);
    },
    [navigate, index]
  );

  return (
    <HeaderLayout
      showTopMenu={true}
      canChangeChainInfo={false}
      smallTitle={true}
      alternativeTitle={intl.formatMessage({
        id: "setting.clear.confirm.title",
      })}
      showBottomMenu={false}
      showChainName={false}
      onBackButton={useCallback(() => {
        analyticsStore.logEvent("back_click", { pageName: "Delete Account" });
        navigate(-1);
      }, [navigate])}
    >
      <div className={style["container"]}>
        <DeleteDescription />

        <Form
          onSubmit={(e) => e.preventDefault()}
          onKeyDownCapture={(event) => {
            if (event.key === "Enter") {
              event.preventDefault(); // Prevent default form submission
              setIsConfirmationOpen(true);
            }
          }}
        >
          <PasswordInput
            labelStyle={{
              marginTop: "0px",
            }}
            error={errors.password && errors.password.message}
            passwordLabel="Enter Password"
            floatLabel={true}
            {...register("password", {
              required: intl.formatMessage({
                id: "setting.clear.input.password.error.required",
              }),
            })}
            containerStyle={{ width: "100%" }}
          />

          <div>
            {keyStore.type === "mnemonic" && (
              <Alert className={style["alert"]}>
                <div>
                  <div className={style["textContainer"]}>
                    <img
                      className={style["warningIcon"]}
                      src={require("@assets/svg/wireframe/warning.svg")}
                      alt=""
                    />
                    <div className={style["text"]}>
                      <FormattedMessage id="setting.clear.alert" />
                    </div>
                  </div>
                </div>
              </Alert>
            )}
            {keyStore.type === "mnemonic" && (
              <ButtonV2
                styleProps={{
                  height: "56px",
                  marginTop: "0px",
                  fontSize: "16px",
                  fontWeight: 400,
                }}
                dataLoading={loading}
                text={""}
                onClick={onBackUpMnemonicButtonClick}
              >
                <FormattedMessage id="setting.clear.button.back-up" />
              </ButtonV2>
            )}

            <ButtonV2
              variant="dark"
              styleProps={{
                height: "56px",
              }}
              dataLoading={loading}
              text={""}
              onClick={() => {
                setIsConfirmationOpen(true);
                analyticsStore.logEvent("confirm_click", {
                  pageName: "Home",
                });
              }}
            >
              <FormattedMessage id="setting.clear.button.confirm" />
            </ButtonV2>
          </div>
        </Form>
      </div>

      {/* Confirmation Dropdown */}
      <Dropdown
        styleProp={{ height: "250px", maxHeight: "250px" }}
        setIsOpen={setIsConfirmationOpen}
        isOpen={isConfirmationOpen}
        title=""
        closeClicked={() => setIsConfirmationOpen(true)}
        showCloseIcon={true}
      >
        <div className={style["confimation-container"]}>
          <div className={style["confimation-text-container"]}>
            <div className={style["confirmation-title"]}>
              <FormattedMessage id="setting.clear.confirm.title" />
            </div>
            <div className={style["confirmation-subTitle"]}>
              <FormattedMessage id="setting.clear.confirm.subtitle" />
            </div>
          </div>

          <div className={style["confirmation-button-container"]}>
            <ButtonV2
              styleProps={{
                height: "56px",
                marginTop: "0px",
              }}
              data-loading={loading}
              text={""}
              onClick={() => {
                setIsConfirmationOpen(false);
                analyticsStore.logEvent("delete_account_click", {
                  action: "Cancel",
                });
              }}
            >
              <FormattedMessage id="setting.clear.confirm.button-cancel" />
            </ButtonV2>

            <ButtonV2
              variant="dark"
              styleProps={{
                height: "56px",
                marginTop: "0px",
              }}
              dataLoading={loading}
              text={""}
              onClick={handleSubmit(async (data) => {
                setLoading(true);
                try {
                  // Make sure that password is valid and keyring is cleared.
                  await keyRingStore.deleteKeyRing(
                    parseInt(index),
                    data.password
                  );
                  analyticsStore.logEvent("delete_account_click", {
                    action: "Remove",
                  });
                  navigate("/");
                } catch (e) {
                  setIsConfirmationOpen(false);
                  console.log("Fail to decrypt: " + e.message);
                  setError("password", {
                    message: intl.formatMessage({
                      id: "setting.clear.input.password.error.invalid",
                    }),
                  });
                  setLoading(false);
                }
              })}
            >
              <FormattedMessage id="setting.clear.button.confirm" />
              {loading && <i className="fas fa-spinner fa-spin ml-2 mr-2" />}
            </ButtonV2>
          </div>
        </div>
      </Dropdown>
    </HeaderLayout>
  );
};
