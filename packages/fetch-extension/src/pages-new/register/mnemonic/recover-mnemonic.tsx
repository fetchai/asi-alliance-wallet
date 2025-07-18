import React, { FunctionComponent, useEffect, useState } from "react";

import { Form, Label } from "reactstrap";
import keyIcon from "@assets/svg/wireframe/key-icon.png";
import { FormattedMessage, useIntl } from "react-intl";
import style from "../style.module.scss";
import styleRecoverMnemonic from "./recover-mnemonic.module.scss";
import { BackButton } from "../index";
import { Input, PasswordInput } from "@components-v2/form";
import { useForm } from "react-hook-form";
import { observer } from "mobx-react-lite";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { AdvancedBIP44Option, useBIP44Option } from "../advanced-bip44";

import { Buffer } from "buffer/";
import { useStore } from "../../../stores";
import classnames from "classnames";
import { ButtonV2 } from "@components-v2/buttons/button";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { Card } from "@components-v2/card";
import { ImportLedgerPage } from "../ledger";
import { MigrateEthereumAddressPage } from "../migration";
import { NewMnemonicStep } from "./hook";
import { PasswordValidationChecklist } from "../password-checklist";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bip39 = require("bip39");

const enum AccountSetupType {
  MIGRATE_ETH = "migrate-eth",
  CONNECT_HARDWARE = "connect-hardware",
}

export function isPrivateKey(str: string): boolean {
  if (str.startsWith("0x")) {
    return true;
  }

  if (str.length === 64) {
    try {
      return Buffer.from(str, "hex").length === 32;
    } catch {
      return false;
    }
  }
  return false;
}

function validatePrivateKey(value: string): boolean {
  if (isPrivateKey(value)) {
    value = value.replace("0x", "");
    if (value.length !== 64) {
      return false;
    }
    return (
      Buffer.from(value, "hex").toString("hex").toLowerCase() ===
      value.toLowerCase()
    );
  }
  return false;
}

interface FormData {
  name: string;
  password: string;
  confirmPassword: string;
}

export const TypeRecoverMnemonic = "recover-mnemonic";

export const RecoverMnemonicIntro: FunctionComponent<{
  registerConfig: RegisterConfig;
}> = observer(({ registerConfig }) => {
  const { analyticsStore } = useStore();

  return (
    <React.Fragment>
      <div
        style={{ marginTop: "12px" }}
        className={style["card"]}
        onClick={(e: any) => {
          e.preventDefault();

          registerConfig.setType(TypeRecoverMnemonic);
          analyticsStore.logEvent("import_a_wallet_click", {
            pageName: "Register",
            registerType: "seed",
          });
        }}
      >
        <img src={require("@assets/svg/wireframe/import-icon.svg")} alt="" />
        <div>
          <div className={style["cardTitle"]}>Import existing wallet</div>
          <div className={style["cardText"]}>
            Access your existing wallet using a recovery phrase / private key
          </div>
        </div>
      </div>
    </React.Fragment>
  );
});

enum SeedType {
  WORDS12 = "12words",
  WORDS24 = "24words",
  PRIVATE_KEY = "private_key",
}
export const RecoverMnemonicMainPage: FunctionComponent<{
  registerConfig: RegisterConfig;
  setSelectedCard: any;
}> = ({ registerConfig, setSelectedCard }) => {
  const { analyticsStore, uiConfigStore } = useStore();
  return (
    <div className={style["mainpageOuterContainer"]}>
      <div className={style["mainpageContainer"]}>
        <div className={styleRecoverMnemonic["mainpageBackButton"]}>
          <BackButton
            onClick={() => {
              registerConfig.clear();
            }}
          />
        </div>
        <div className={style["mainpageTitle"]}>Import existing wallet</div>
        <div style={{ width: "390px" }}>
          <Card
            leftImageStyle={{
              width: "32px",
              height: "32px",
            }}
            style={{
              display: "flex",
              height: "78px",
              fontSize: "14px",
              padding: "18px",
            }}
            onClick={(e: any) => {
              e.preventDefault();
              setSelectedCard("recover");
              registerConfig.setType(TypeRecoverMnemonic);
              analyticsStore.logEvent(
                "use_a_seed_phrase_or_a_private_key_click",
                { pageName: "Register", registerType: "seed" }
              );
            }}
            leftImage={keyIcon}
            heading={"Use a seed phrase or a private key"}
          />
          {uiConfigStore.platform != "firefox" && (
            <Card
              leftImageStyle={{
                width: "32px",
                height: "32px",
              }}
              style={{
                display: "flex",
                height: "78px",
                fontSize: "14px",
                padding: "18px",
              }}
              onClick={(e: any) => {
                e.preventDefault();
                setSelectedCard(AccountSetupType.CONNECT_HARDWARE);
                registerConfig.setType(TypeRecoverMnemonic);
                analyticsStore.logEvent("connect_hardware_wallet_click", {
                  registerType: "ledger",
                  accountType: "ledger",
                  pageName: "Register",
                });
              }}
              leftImage={require("@assets/svg/wireframe/hardware.svg")}
              heading={"Connect hardware wallet"}
              subheading={"Please connect via USB"}
              subheadingStyle={{
                fontSize: "14px",
                opacity: 0.6,
              }}
            />
          )}
          <Card
            leftImageStyle={{
              width: "32px",
              height: "32px",
              background: "white",
            }}
            style={{
              height: "78px",
              display: "flex",
              fontSize: "14px",
              padding: "18px",
            }}
            onClick={(e: any) => {
              e.preventDefault();
              setSelectedCard(AccountSetupType.MIGRATE_ETH);
              registerConfig.setType(TypeRecoverMnemonic);
              analyticsStore.logEvent("migrate_from_eth_click", {
                registerType: "seed",
                pageName: "Register",
                accountType: "mnemonic",
              });
            }}
            leftImage={require("@assets/svg/wireframe/metamask-icon.svg")}
            heading={"Migrate from ETH"}
          />
        </div>
      </div>
    </div>
  );
};

export const RecoverMnemonicPage: FunctionComponent<{
  registerConfig: RegisterConfig;
}> = observer(({ registerConfig }) => {
  const intl = useIntl();

  const bip44Option = useBIP44Option();
  const [password, setPassword] = useState("");
  const [passwordChecklistError, setPasswordChecklistError] = useState(
    // initially sets the password error as true for create mode
    registerConfig.mode === "create" ? true : false
  );

  const { analyticsStore } = useStore();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
  });

  const [shownMnemonicIndex, setShownMnemonicIndex] = useState(-1);

  const [seedType, _setSeedType] = useState(SeedType.WORDS12);
  const [seedWords, setSeedWords] = useState<string[]>(
    new Array<string>(12).fill("")
  );

  const setSeedType = (seedType: SeedType) => {
    _setSeedType(seedType);
    setShownMnemonicIndex(-1);

    if (seedType === SeedType.WORDS12) {
      setSeedWords((seedWords) => {
        if (seedWords.length < 12) {
          return seedWords.concat(new Array(12 - seedWords.length).fill(""));
        } else {
          return seedWords.slice(0, 12);
        }
      });
    }
    if (seedType === SeedType.WORDS24) {
      setSeedWords((seedWords) => {
        if (seedWords.length < 24) {
          return seedWords.concat(new Array(24 - seedWords.length).fill(""));
        } else {
          return seedWords.slice(0, 24);
        }
      });
    }
    if (seedType === SeedType.PRIVATE_KEY) {
      setSeedWords((seedWords) => seedWords.slice(0, 1));
    }
  };

  const handlePaste = (index: number, value: string) => {
    const words = value
      .trim()
      .split(" ")
      .map((word) => word.trim());

    if (words.length === 1) {
      // If the length of pasted words is 1 and the word is guessed as a private key,
      // set seed type as private key automatically.
      if (isPrivateKey(words[0])) {
        setSeedType(SeedType.PRIVATE_KEY);
        setSeedWords([words[0]]);
        return;
      }
    }

    if (words.length === 12 || words.length === 24) {
      // 12/24 words are treated specially.
      // Regardless of where it is pasted from, if it is a valid seed, it will be processed directly.
      if (bip39.validateMnemonic(words.join(" "))) {
        if (words.length === 12) {
          setSeedType(SeedType.WORDS12);
        } else {
          setSeedType(SeedType.WORDS24);
        }

        setSeedWords(words);

        return;
      }
    }

    let newSeedWords = seedWords.slice();
    const expectedLength = Math.min(index + words.length, 24);

    if (seedWords.length < expectedLength) {
      newSeedWords = newSeedWords.concat(
        new Array(expectedLength - seedWords.length).fill("")
      );

      if (expectedLength > 12) {
        setSeedType(SeedType.WORDS24);
      } else {
        setSeedType(SeedType.WORDS12);
      }
    }

    for (let i = index; i < expectedLength; i++) {
      newSeedWords[i] = words[i - index];
    }

    setSeedWords(newSeedWords);
  };

  const [seedWordsError, setSeedWordsError] = useState<string | undefined>(
    undefined
  );

  const validateSeedWords = (seedWords: string[]) => {
    seedWords = seedWords.map((word) => word.trim());
    if (seedWords.join(" ").trim().length === 0) {
      return "__required__";
    }
    if (seedWords.length === 1 && isPrivateKey(seedWords[0])) {
      if (!validatePrivateKey(seedWords[0])) {
        return "__invalid__";
      }
      return undefined;
    } else {
      // num words is the length to the last non-empty word.
      let numWords = 0;
      for (let i = 0; i < seedWords.length; i++) {
        if (seedWords[i].length > 0) {
          numWords = i + 1;
        }
      }

      seedWords = seedWords.slice(0, numWords);
      // If an empty word exists in the middle of words, it is treated as an error.
      if (seedWords.find((word) => word.length === 0)) {
        return "__invalid__";
      }

      if (numWords < 9) {
        return intl.formatMessage({
          id: "register.create.textarea.mnemonic.error.too-short",
        });
      }

      if (!bip39.validateMnemonic(seedWords.join(" "))) {
        return "__invalid__";
      }

      return undefined;
    }
  };
  const tabs = [
    { id: NewMnemonicStep.WORDS12 },
    { id: NewMnemonicStep.WORDS24 },
    { id: NewMnemonicStep.PRIVATEKEY },
  ];
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [selectedCard, setSelectedCard] = useState("main");

  useEffect(() => {
    const handleTabChange = (activeTab: any) => {
      if (activeTab === NewMnemonicStep.WORDS12) {
        setSeedType(SeedType.WORDS12);
      } else if (activeTab === NewMnemonicStep.WORDS24) {
        setSeedType(SeedType.WORDS24);
      } else if (activeTab === NewMnemonicStep.PRIVATEKEY) {
        setSeedType(SeedType.PRIVATE_KEY);
      }
    };

    handleTabChange(activeTab);
  }, [activeTab]);

  return (
    <React.Fragment>
      {selectedCard === "main" && (
        <RecoverMnemonicMainPage
          registerConfig={registerConfig}
          setSelectedCard={setSelectedCard}
        />
      )}
      {selectedCard == "recover" && (
        <React.Fragment>
          <div className={styleRecoverMnemonic["backButtonContainer"]}>
            <BackButton
              onClick={() => {
                // registerConfig.clear();
                setSelectedCard("main");
              }}
            />
          </div>
          <h1 className={styleRecoverMnemonic["title"]}>Import your wallet</h1>
          <div className={styleRecoverMnemonic["container"]}>
            <div className={styleRecoverMnemonic["tabsContainer"]}>
              <TabsPanel tabs={tabs} setActiveTab={setActiveTab} />
            </div>
            <div
              className={classnames(
                style["title"],
                styleRecoverMnemonic["title"]
              )}
            />
            <Form
              className={style["formContainer"]}
              onSubmit={(e) => {
                e.preventDefault();

                const seedWordsError = validateSeedWords(seedWords);
                if (seedWordsError) {
                  setSeedWordsError(seedWordsError);
                  return;
                } else {
                  setSeedWordsError(undefined);
                }

                handleSubmit(async (data: FormData) => {
                  try {
                    if (seedWords.length === 1 && isPrivateKey(seedWords[0])) {
                      const privateKey = Buffer.from(
                        seedWords[0].replace("0x", ""),
                        "hex"
                      );
                      await registerConfig.createPrivateKey(
                        data.name,
                        privateKey,
                        data.password
                      );
                      analyticsStore.setUserProperties({
                        registerType: "seed",
                        accountType: "privateKey",
                      });
                    } else {
                      await registerConfig.createMnemonic(
                        data.name,
                        // In logic, not 12/24 words can be handled.
                        // However, seed words have only a length of 12/24 when mnemonic.
                        // Since the rest has an empty string, additional spaces are created by the empty string after join.
                        // Therefore, trim should be done last.
                        seedWords.join(" ").trim(),
                        data.password,
                        bip44Option.bip44HDPath
                      );
                      analyticsStore.setUserProperties({
                        registerType: "seed",
                        accountType: "mnemonic",
                      });
                    }
                  } catch (e) {
                    alert(e.message ? e.message : e.toString());
                    registerConfig.clear();
                  }
                })(e);
              }}
            >
              <div
                style={{
                  ...(activeTab === NewMnemonicStep.WORDS12
                    ? { gridTemplateColumns: "1fr 1fr 1fr" }
                    : {}),
                  ...(seedType === SeedType.PRIVATE_KEY
                    ? {
                        marginLeft: "170px",
                        width: "333px",
                        gridTemplateColumns: "1fr",
                      }
                    : {}),
                }}
                className={classnames(
                  styleRecoverMnemonic["mnemonicContainer"],
                  {
                    [styleRecoverMnemonic["privateKey"]]:
                      seedType === SeedType.PRIVATE_KEY,
                  }
                )}
              >
                {seedWords.map((word, index) => {
                  return (
                    <div
                      key={index}
                      className={styleRecoverMnemonic["mnemonicWordContainer"]}
                    >
                      <Input
                        maxLength={seedType === SeedType.PRIVATE_KEY ? 50 : 16}
                        style={
                          seedType === SeedType.PRIVATE_KEY
                            ? {
                                width: "335px",
                                height: "53px",
                              }
                            : {}
                        }
                        type={
                          shownMnemonicIndex === index ? "text" : "password"
                        }
                        formGroupClassName={
                          styleRecoverMnemonic["mnemonicWordFormGroup"]
                        }
                        className={styleRecoverMnemonic["mnemonicWord"]}
                        onPaste={(e) => {
                          e.preventDefault();

                          handlePaste(index, e.clipboardData.getData("text"));
                        }}
                        onChange={(e) => {
                          e.preventDefault();

                          if (
                            shownMnemonicIndex >= 0 &&
                            shownMnemonicIndex !== index
                          ) {
                            setShownMnemonicIndex(-1);
                          }

                          const newSeedWords = seedWords.slice();
                          newSeedWords[index] = e.target.value.trim();
                          setSeedWords(newSeedWords);
                        }}
                        value={word}
                        append={
                          <div
                            style={{
                              position: "absolute",
                              right: "18px",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              cursor: "pointer",
                              zIndex: 1000,
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              setShownMnemonicIndex((prev) => {
                                if (prev === index) {
                                  return -1;
                                }
                                return index;
                              });
                            }}
                          >
                            {shownMnemonicIndex === index ? (
                              <IconOpenEye height={16} width={16} />
                            ) : (
                              <IconClosedEye height={16} width={16} />
                            )}
                          </div>
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {seedWordsError ? (
                <div className={styleRecoverMnemonic["alert"]}>
                  {(() => {
                    if (seedWordsError === "__required__") {
                      if (seedType === SeedType.PRIVATE_KEY) {
                        return intl.formatMessage({
                          id: "register.import.textarea.private-key.error.required",
                        });
                      } else {
                        return intl.formatMessage({
                          id: "register.import.textarea.mnemonic.error.required",
                        });
                      }
                    }

                    if (seedWordsError === "__invalid__") {
                      if (seedType === SeedType.PRIVATE_KEY) {
                        return intl.formatMessage({
                          id: "register.import.textarea.private-key.error.invalid",
                        });
                      } else {
                        return intl.formatMessage({
                          id: "register.import.textarea.mnemonic.error.invalid",
                        });
                      }
                    }

                    return seedWordsError;
                  })()}
                </div>
              ) : null}
              <div className={styleRecoverMnemonic["formInnerContainer"]}>
                {seedType !== SeedType.PRIVATE_KEY && (
                  <ButtonV2
                    type="button"
                    styleProps={{
                      width: "fit-content",
                      padding: "10px 20px",
                      height: "auto",
                      fontSize: "14px",
                      marginBottom: "10px",
                      marginTop: "0px",
                    }}
                    text="Clear All"
                    variant="dark"
                    onClick={() => {
                      if (seedType === SeedType.WORDS12) {
                        setSeedWords(new Array<string>(12).fill(""));
                      } else if (seedType == SeedType.WORDS24) {
                        setSeedWords(new Array<string>(24).fill(""));
                      }
                    }}
                  />
                )}
                <div>
                  <Label for="name" className={style["label"]}>
                    {intl.formatMessage({ id: "register.name" })}
                  </Label>
                  <Input
                    className={styleRecoverMnemonic["addressInput"]}
                    style={{ width: "333px" }}
                    type="text"
                    {...register("name", {
                      required: intl.formatMessage({
                        id: "register.name.error.required",
                      }),
                    })}
                    error={errors.name && errors.name.message}
                    maxLength={20}
                  />
                </div>
                {registerConfig.mode === "create" ? (
                  <React.Fragment>
                    <PasswordInput
                      {...register("password", {
                        required: intl.formatMessage({
                          id: "register.create.input.password.error.required",
                        }),
                        validate: (password: string): string | undefined => {
                          if (password.length < 8) {
                            return intl.formatMessage({
                              id: "register.create.input.password.error.too-short",
                            });
                          }
                        },
                      })}
                      onChange={(e: any) => setPassword(e.target.value)}
                      error={errors.password && errors.password.message}
                    />
                    <PasswordInput
                      passwordLabel="Confirm Password"
                      {...register("confirmPassword", {
                        required: intl.formatMessage({
                          id: "register.create.input.confirm-password.error.required",
                        }),
                        validate: (
                          confirmPassword: string
                        ): string | undefined => {
                          if (
                            confirmPassword !== getValues()["confirmPassword"]
                          ) {
                            return intl.formatMessage({
                              id: "register.create.input.confirm-password.error.unmatched",
                            });
                          }
                        },
                      })}
                      error={
                        errors.confirmPassword && errors.confirmPassword.message
                      }
                    />
                    <div className="mt-4 space-y-1 text-sm">
                      <PasswordValidationChecklist
                        password={password}
                        onStatusChange={(status) =>
                          setPasswordChecklistError(!status)
                        }
                      />
                    </div>
                  </React.Fragment>
                ) : null}
                <div
                  style={{
                    height: "20px",
                  }}
                />
                <AdvancedBIP44Option bip44Option={bip44Option} />
                <ButtonV2
                  variant="dark"
                  text={
                    registerConfig.isLoading ? (
                      <i className="fas fa-spinner fa-spin ml-2" />
                    ) : (
                      <FormattedMessage id="register.create.button.next" />
                    )
                  }
                  styleProps={{
                    marginBottom: "20px",
                    height: "56px",
                  }}
                  data-loading={registerConfig.isLoading}
                  disabled={registerConfig.isLoading || passwordChecklistError}
                  onClick={() => {
                    analyticsStore.logEvent("register_next_click", {
                      pageName: "Register",
                      registerType: "seed",
                    });
                  }}
                />
              </div>
            </Form>
          </div>
        </React.Fragment>
      )}
      {selectedCard == AccountSetupType.CONNECT_HARDWARE && (
        <div style={{ height: "720px" }}>
          <ImportLedgerPage
            registerConfig={registerConfig}
            setSelectedCard={setSelectedCard}
          />
        </div>
      )}
      {selectedCard == AccountSetupType.MIGRATE_ETH && (
        <MigrateEthereumAddressPage
          registerConfig={registerConfig}
          setSelectedCard={setSelectedCard}
        />
      )}
    </React.Fragment>
  );
});

const IconClosedEye: FunctionComponent<{
  width?: number;
  height?: number;
  color?: string;
}> = ({ width = 28, height = 29, color = "#101418" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      viewBox="0 0 28 29"
    >
      <path
        fill={color}
        d="M23.625 25.302a.868.868 0 01-.618-.256L3.757 5.796a.875.875 0 011.237-1.237l19.25 19.25a.876.876 0 01-.619 1.493zm-9.643-3.5c-2.27 0-4.457-.671-6.504-1.996-1.863-1.203-3.54-2.926-4.85-4.977v-.004c1.09-1.562 2.284-2.884 3.567-3.949a.11.11 0 00.008-.16l-1.09-1.088a.11.11 0 00-.148-.007c-1.362 1.148-2.627 2.557-3.777 4.207a1.746 1.746 0 00-.035 1.943c1.444 2.26 3.303 4.164 5.374 5.504 2.333 1.511 4.843 2.277 7.455 2.277 1.41-.004 2.81-.237 4.145-.688a.11.11 0 00.042-.181l-1.18-1.18a.218.218 0 00-.21-.055c-.913.236-1.853.354-2.797.354zm12.861-7.951c-1.447-2.238-3.324-4.14-5.429-5.498-2.328-1.505-4.898-2.301-7.432-2.301-1.395.003-2.78.24-4.096.702a.11.11 0 00-.04.18l1.178 1.18a.219.219 0 00.212.054 10.545 10.545 0 012.746-.366c2.225 0 4.407.68 6.483 2.023 1.898 1.226 3.595 2.947 4.909 4.977a.007.007 0 01.001.004l-.001.005a16.993 16.993 0 01-3.507 3.977.109.109 0 00-.033.124.109.109 0 00.025.038l1.088 1.087a.11.11 0 00.148.007 18.784 18.784 0 003.754-4.292 1.76 1.76 0 00-.006-1.902z"
      />
      <path
        fill={color}
        d="M14 9.552c-.393 0-.785.044-1.168.131a.11.11 0 00-.055.185l6.157 6.155a.11.11 0 00.185-.054A5.25 5.25 0 0014 9.552zM9.066 13.58a.11.11 0 00-.108-.028.109.109 0 00-.076.083 5.25 5.25 0 006.289 6.289.11.11 0 00.054-.185L9.066 13.58z"
      />
    </svg>
  );
};

const IconOpenEye: FunctionComponent<{
  width?: number;
  height?: number;
  color?: string;
}> = ({ width = 28, height = 29, color = "#101418" }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 13"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 1.9375C6.19531 1.9375 4.74609 2.75781 3.625 3.79688C2.55859 4.78125 1.84766 5.92969 1.46484 6.75C1.84766 7.57031 2.55859 8.74609 3.625 9.73047C4.74609 10.7695 6.19531 11.5625 8 11.5625C9.77734 11.5625 11.2266 10.7695 12.3477 9.73047C13.4141 8.74609 14.1523 7.57031 14.5078 6.75C14.1523 5.92969 13.4141 4.78125 12.375 3.79688C11.2266 2.75781 9.77734 1.9375 8 1.9375ZM2.72266 2.83984C4.00781 1.63672 5.78516 0.625 8 0.625C10.1875 0.625 11.9648 1.63672 13.25 2.83984C14.5352 4.04297 15.3828 5.4375 15.793 6.42188C15.875 6.64062 15.875 6.88672 15.793 7.10547C15.3828 8.0625 14.5352 9.48438 13.25 10.6875C11.9648 11.8906 10.1875 12.875 8 12.875C5.78516 12.875 4.00781 11.8906 2.72266 10.6875C1.4375 9.48438 0.589844 8.0625 0.179688 7.10547C0.0976562 6.88672 0.0976562 6.64062 0.179688 6.42188C0.589844 5.4375 1.4375 4.01562 2.72266 2.83984ZM8 8.9375C9.20312 8.9375 10.1875 7.98047 10.1875 6.75C10.1875 5.54688 9.20312 4.5625 8 4.5625C7.97266 4.5625 7.94531 4.5625 7.94531 4.5625C7.97266 4.72656 8 4.86328 8 5C8 5.98438 7.20703 6.75 6.25 6.75C6.08594 6.75 5.94922 6.75 5.8125 6.69531C5.8125 6.72266 5.8125 6.75 5.8125 6.75C5.8125 7.98047 6.76953 8.9375 8 8.9375ZM8 3.25C9.23047 3.25 10.3789 3.93359 11.0078 5C11.6367 6.09375 11.6367 7.43359 11.0078 8.5C10.3789 9.59375 9.23047 10.25 8 10.25C6.74219 10.25 5.59375 9.59375 4.96484 8.5C4.33594 7.43359 4.33594 6.09375 4.96484 5C5.59375 3.93359 6.74219 3.25 8 3.25Z"
        fill={color}
      />
    </svg>
  );
};
