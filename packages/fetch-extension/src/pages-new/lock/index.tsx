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

  const [isStartWithMigrating] = useState(() => keyRingStore.isMigrating);
  useEffect(() => {
    // Migration can take a while when there are many accounts.
    // Users may close and reopen the UI before it finishes, so show migration
    // state in the view first. This is view-only handling; background
    // communication is one-way, so reacting when migration completes is hard.
    // This case is rare anyway, so track via mobx and close the window when
    // migration finishes.
    if (isStartWithMigrating) {
      autorun(() => {
        if (!keyRingStore.isMigrating) {
          window.close();
        }
      });
    }
  }, [isStartWithMigrating, keyRingStore.isMigrating]);

  const [isLoading, setIsLoading] = useState(false);
  const needsKeyStoreMigration =
    keyRingStore.needMigration || keyRingStore.isMigrating;
  const isUnlockBusy = isLoading || keyRingStore.isMigrating;

  // postMessage uses browser.extension.getViews(), which has no option to
  // exclude the current view. Assign each view a random id to identify itself.
  const [viewPostMessageId] = useState(() => {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString("hex");
  });

  const tryUnlock = async (password: string) => {
    try {
      setIsLoading(true);

      if (keyRingStore.needMigration) {
        await keyRingStore.checkLegacyKeyRingPassword(password);
      }

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
        message: keyRingStore.needMigration
          ? intl.formatMessage({
              id: "lock.input.password.error.invalid",
            })
          : e?.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // When multiple views are open (e.g. extension popup unlock and an external
  // unlock window), completing unlock in one view should update the others.
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
          if (isUnlockBusy) {
            return;
          }
          await tryUnlock(data.password);
        })}
      >
        <div className={style["banner"]}>
          <img src={require("@assets/png/ASI-Logo-Icon-black.png")} alt="" />
        </div>

        <div className={style["password-field"]}>
          <div className={style["welcome-text"]}>
            {needsKeyStoreMigration ? "Upgrade required" : "Welcome back"}
          </div>
          <div className={style["text"]}>
            {needsKeyStoreMigration
              ? "A one-time wallet upgrade is needed. Enter your password and keep this window open until it finishes."
              : "Enter your password to sign in"}
          </div>
          <div>
            <PasswordInput
              placeholder="Password"
              error={errors.password && errors.password.message}
              {...register("password", {
                required: keyRingStore.isMigrating
                  ? false
                  : intl.formatMessage({
                      id: "lock.input.password.error.required",
                    }),
              })}
            />
          </div>
          <Button
            className={style["sign-in"]}
            block
            type="submit"
            disabled={isUnlockBusy}
            isLoading={
              isUnlockBusy ||
              (() => {
                const interactions = interactionStore.getAllData("unlock");
                for (const interaction of interactions) {
                  if (interactionStore.isObsoleteInteraction(interaction.id)) {
                    return true;
                  }
                }
                return false;
              })()
            }
          >
            {isUnlockBusy ? (
              <i className="fas fa-spinner fa-spin ml-2 mr-2" />
            ) : (
              <div>
                {needsKeyStoreMigration ? "Upgrade and sign in" : "Sign in"}
              </div>
            )}
          </Button>
        </div>
      </Form>
    </EmptyLayout>
  );
});
