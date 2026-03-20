import React, { FunctionComponent, useEffect, useState } from "react";

import { PasswordInput } from "@components-v2/form";

import { Button, Form } from "reactstrap";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";
// import { Banner } from "@components/banner";
import { useForm } from "react-hook-form";

import { EmptyLayout } from "@layouts/empty-layout";

import style from "./style.module.scss";

import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";
import { autorun } from "mobx";
import { StartAutoLockMonitoringMsg } from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";

interface FormData {
  password: string;
}

export const LockPage: FunctionComponent = observer(() => {
  const intl = useIntl();
  const navigate = useNavigate();

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

  const { keyRingStore, analyticsStore, interactionStore } = useStore();
  const [loading, setLoading] = useState(false);

  const [isStartWithMigrating] = useState(() => keyRingStore.isMigrating);
  useEffect(() => {
    // 계정이 많으면 migration이 오래 걸릴 수 있다.
    // 이걸 못 참고 유저가 UI를 끄고 다시 킬수도 있기 때문에
    // migration이 진행 중이라는 것에 대해서 우선적으로 UI를 처리해준다.
    // 근데 이건 view에서만 처리해주고...
    // background와의 통신이 단방향이기 때문에 migration이 끝났을 때 무슨 행동을 취하기가 어렵다.
    // 어쨋든 이런 상황은 거의 발생하지 않기 때문에
    // mobx를 통해서 추적하고 migration이 끝나면 그냥 window를 close한다.
    if (isStartWithMigrating) {
      autorun(() => {
        if (!keyRingStore.isMigrating) {
          window.close();
        }
      });
    }
  }, [isStartWithMigrating, keyRingStore.isMigrating]);

  const [isLoading, setIsLoading] = useState(false);

  const [isMigrationSecondPhase, setIsMigrationSecondPhase] = useState(false);
  // 유저가 enter를 누르고 처리하는 딜레이 동안 키보드를 또 누를수도 있다...
  // 그 경우를 위해서 따로 state를 관리한다.
  const [migrationSecondPhasePassword, setMigrationSecondPhasePassword] =
    useState("");

  // post message를 쓸때 browser.extension.getViews()를 쓰는데 자기 자신을 제외하는 옵션은 없는 것 같음.
  // 그냥 대충 각 view가 고유의 id를 가상으로 가지게 해서 처리한다.
  const [viewPostMessageId] = useState(() => {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString("hex");
  });

  const tryUnlock = async (password: string) => {
    try {
      setIsLoading(true);

      await keyRingStore.unlockWithoutSyncStatus(password);

      let closeWindowAfterProceedNext = false;

      // Approve all waiting interaction for the enabling key ring.
      const interactions = interactionStore.getAllData("unlock");
      if (interactions.length > 0) {
        let onlyHasExternal = true;
        for (const interaction of interactions) {
          if (interaction.isInternal) {
            onlyHasExternal = false;
          }
        }
        await interactionStore.approveWithProceedNextV2(
          interactions.map((interaction) => interaction.id),
          {},
          (proceedNext) => {
            if (onlyHasExternal) {
              if (!proceedNext) {
                closeWindowAfterProceedNext = true;
              }
            }
          }
        );
      }

      for (const view of browser.extension.getViews()) {
        view.postMessage(
          {
            type: "__keplr_unlocked_from_view",
            viewId: viewPostMessageId,
          },
          window.location.origin
        );
      }

      if (closeWindowAfterProceedNext) {
        handleExternalInteractionWithNoProceedNext();
      }

      await keyRingStore.refreshKeyRingStatus();
      const msg = new StartAutoLockMonitoringMsg();
      const requester = new InExtensionMessageRequester();
      // Make sure to notify that auto lock service to start check locking after duration.
      await requester.sendMessage(BACKGROUND_PORT, msg);
      analyticsStore.logEvent("sign_in_click");
      navigate("/", { replace: true });
      setError("password", {
        message: "",
      });
    } catch (e) {
      console.log(e);
      setError("password", {
        message: e?.message,
      });

      // 사실 migration이 오류로 실패하면 이미 답이 없는 상황임...
      setIsMigrationSecondPhase(false);
      setMigrationSecondPhasePassword("");
    } finally {
      setIsLoading(false);
    }
  };

  // view가 여러개일때 (예를들어 extension popup의 unlock 창과 외부 요청에 의해 unlock window가 열린 상태일때
  // 한 곳에서 unlock이 완료되면 다른 view에서도 적절하게 처리해준다.
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type === "__keplr_unlocked_from_view") {
        if (e.data.viewId !== viewPostMessageId) {
          let closeWindowAfterProceedNext = false;

          // Approve all waiting interaction for the enabling key ring.
          const interactions = interactionStore.getAllData("unlock");
          if (interactions.length > 0) {
            let onlyHasExternal = true;
            for (const interaction of interactions) {
              if (interaction.isInternal) {
                onlyHasExternal = false;
              }
            }
            await interactionStore.approveWithProceedNextV2(
              interactions.map((interaction) => interaction.id),
              {},
              (proceedNext) => {
                if (onlyHasExternal) {
                  if (!proceedNext) {
                    closeWindowAfterProceedNext = true;
                  }
                }
              }
            );
          }

          if (closeWindowAfterProceedNext) {
            handleExternalInteractionWithNoProceedNext();
          }

          keyRingStore.refreshKeyRingStatus();
        }
      }
    };

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [interactionStore, keyRingStore, viewPostMessageId]);

  return (
    <EmptyLayout className={style["layout"]}>
      <Form
        className={style["formContainer"]}
        onSubmit={handleSubmit(async (data) => {
          setLoading(true);
          try {
            // await keyRingStore.unlock(data.password);
            if (isMigrationSecondPhase) {
              // Migration은 enter를 눌러서 진행할 수 없고 명시적으로 버튼을 눌러야한다.
              // 근데 사실 migration 버튼은 type이 button이라 onSubmit이 발생할일은 없음.
              return;
            }

            if (keyRingStore.needMigration) {
              try {
                setIsLoading(true);

                await keyRingStore.checkLegacyKeyRingPassword(data.password);
                setIsMigrationSecondPhase(true);
                setMigrationSecondPhasePassword(data.password);

                setError("password", {
                  message: "",
                });
              } catch (e) {
                console.log("Fail to decrypt: " + e.message);
                setError("password", {
                  message: intl.formatMessage({
                    id: "lock.input.password.error.invalid",
                  }),
                });
              } finally {
                setIsLoading(false);
              }
            } else {
              await tryUnlock(data.password);
            }
          } catch (e) {
            console.log("Fail to decrypt: " + e.message);
            setError("password", {
              message: intl.formatMessage({
                id: "lock.input.password.error.invalid",
              }),
            });
            setLoading(false);
          }
        })}
      >
        <div className={style["banner"]}>
          <img src={require("@assets/png/ASI-Logo-Icon-black.png")} alt="" />
        </div>

        <div className={style["password-field"]}>
          <div className={style["welcome-text"]}>Welcome back</div>
          <div className={style["text"]}>Enter your password to sign in</div>
          <div>
            <PasswordInput
              placeholder="Password"
              error={errors.password && errors.password.message}
              {...register("password", {
                required: intl.formatMessage({
                  id: "lock.input.password.error.required",
                }),
              })}
            />
          </div>
          {(() => {
            if (isMigrationSecondPhase || keyRingStore.isMigrating) {
              // keyRingStore.isMigrating은 migration을 누르고 UI을 껏다 켰을때 여전히 진행 중일 가능성이 있다.
              // 그러므로 keyRingStore.isMigrating 처리에 우선권이 있어야한다는 점을 주의해야한다.
              return (
                <Button
                  type="button"
                  block
                  disabled={keyRingStore.isMigrating}
                  style={{
                    opacity: keyRingStore.isMigrating ? 0 : 1,
                  }}
                  isLoading={isLoading}
                  onClick={() => {
                    tryUnlock(migrationSecondPhasePassword);
                  }}
                >
                  {keyRingStore.isMigrating ? (
                    <div>
                      Upgrade In Progress{" "}
                      <i className="fas fa-spinner fa-spin ml-2 mr-2" />
                    </div>
                  ) : (
                    <div>Start Migration</div>
                  )}
                </Button>
              );
            }

            return (
              <Button
                className={style["sign-in"]}
                block
                type="submit"
                isLoading={
                  isLoading ||
                  (() => {
                    const interactions = interactionStore.getAllData("unlock");
                    for (const interaction of interactions) {
                      if (
                        interactionStore.isObsoleteInteraction(interaction.id)
                      ) {
                        return true;
                      }
                    }
                    return false;
                  })()
                }
              >
                {loading ? (
                  <i className="fas fa-spinner fa-spin ml-2 mr-2" />
                ) : (
                  <div>Sign in</div>
                )}
              </Button>
            );
          })()}
        </div>
      </Form>
    </EmptyLayout>
  );
});
