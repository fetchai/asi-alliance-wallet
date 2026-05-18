import React, { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Card } from "@components-v2/card";
import { Input } from "@components-v2/form/input";
import { ToggleSwitchButton } from "@components-v2/buttons/toggle-switch-button";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useConfirm } from "@components/confirm";
import { useNotification } from "@components/notification";
import { useStore } from "../../../../stores";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  ClearBlockfrostCredentialsMsg,
  GetBlockfrostCredentialsMsg,
  KeyRingStatus,
  SetBlockfrostCredentialsMsg,
} from "@keplr-wallet/background";
import type { GetBlockfrostCredentialsResponse } from "@keplr-wallet/background";
import type { CardanoNetwork } from "@keplr-wallet/cardano";
import {
  getCardanoNetworkFromChainId,
  mapBlockfrostCredentialsErrorMessage,
} from "../../../../utils/cardano-blockfrost";
import style from "./style.module.scss";

export const CardanoBlockfrostApiPage: React.FC = observer(() => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const notification = useNotification();
  const { chainStore, keyRingStore } = useStore();

  const chainId = chainStore.current.chainId;
  const isCardano = chainStore.current.features?.includes("cardano") ?? false;

  const network = useMemo((): CardanoNetwork | undefined => {
    if (!isCardano) {
      return undefined;
    }

    try {
      return getCardanoNetworkFromChainId(chainId);
    } catch {
      return undefined;
    }
  }, [chainId, isCardano]);

  const requester = useMemo(() => new InExtensionMessageRequester(), []);

  const [credentials, setCredentials] =
    useState<GetBlockfrostCredentialsResponse | null>(null);
  const [projectId, setProjectId] = useState("");
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const isUnlocked = keyRingStore.status === KeyRingStatus.UNLOCKED;

  const loadCredentials = useCallback(async () => {
    if (!network) {
      setCredentials(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setStatusMessage(undefined);
    try {
      const response = await requester.sendMessage(
        BACKGROUND_PORT,
        new GetBlockfrostCredentialsMsg(chainId, network)
      );
      setCredentials(response);
      if (!response.locked) {
        setUseCustomKey(response.useCustomKey);
        setProjectId("");
      }
    } catch {
      setStatusMessage("Could not load Blockfrost settings.");
    } finally {
      setIsLoading(false);
    }
  }, [chainId, network, requester]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const savedButDisabled =
    credentials != null &&
    !credentials.locked &&
    credentials.hasCustomKey &&
    !credentials.useCustomKey;

  const saveCredentials = async (allowUnverifiedSave?: boolean) => {
    if (!network) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(undefined);
    try {
      await requester.sendMessage(
        BACKGROUND_PORT,
        new SetBlockfrostCredentialsMsg(
          chainId,
          network,
          useCustomKey,
          projectId.trim() ? projectId.trim() : undefined,
          allowUnverifiedSave
        )
      );
      notification.push({
        type: "success",
        placement: "top-center",
        duration: 3,
        content: "Blockfrost settings saved",
        canDelete: true,
        transition: { duration: 0.25 },
      });
      await loadCredentials();
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : String(error ?? "");
      if (rawMessage === "blockfrost_credentials_requires_confirmation") {
        const confirmed = await confirm.confirm({
          title: "Save without online verification?",
          paragraph:
            "We could not verify this Blockfrost project ID online. Save it anyway only if you trust this key.",
        });
        if (confirmed) {
          await saveCredentials(true);
        } else {
          setStatusMessage(mapBlockfrostCredentialsErrorMessage(error));
        }
        return;
      }
      setStatusMessage(mapBlockfrostCredentialsErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const clearCredentials = async () => {
    if (!network) {
      return;
    }

    const confirmed = await confirm.confirm({
      title: "Remove custom Blockfrost key?",
      paragraph:
        "This removes your saved project ID for this network. The wallet will use the built-in key when available.",
    });
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(undefined);
    try {
      await requester.sendMessage(
        BACKGROUND_PORT,
        new ClearBlockfrostCredentialsMsg(chainId, network)
      );
      setProjectId("");
      setUseCustomKey(false);
      notification.push({
        type: "success",
        placement: "top-center",
        duration: 3,
        content: "Custom Blockfrost key removed",
        canDelete: true,
        transition: { duration: 0.25 },
      });
      await loadCredentials();
    } catch (error) {
      setStatusMessage(mapBlockfrostCredentialsErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const headerLayoutProps = {
    showTopMenu: true as const,
    smallTitle: true as const,
    showBottomMenu: false as const,
    showChainName: true as const,
    canChangeChainInfo: false as const,
    alternativeTitle: "Blockfrost API",
    onBackButton: () => navigate(-1),
  };

  if (!isCardano || !network) {
    return (
      <HeaderLayout {...headerLayoutProps}>
        <div className={style["page"]}>
          <Card
            heading="Cardano network required"
            subheading="Switch to a Cardano network to manage Blockfrost API settings."
            style={{ marginBottom: "12px" }}
          />
        </div>
      </HeaderLayout>
    );
  }

  return (
    <HeaderLayout {...headerLayoutProps}>
      <div className={style["page"]}>
        <p className={style["intro"]}>
          Cardano uses Blockfrost for balances, history, and sending. You can
          use the built-in key or your own project ID when the shared limit is
          reached.
        </p>

        {isLoading ? (
          <p className={style["hint"]}>Loading settings...</p>
        ) : !isUnlocked ? (
          <Card
            heading="Wallet locked"
            subheading="Unlock your wallet to view or change your Blockfrost API key."
            style={{ marginBottom: "12px" }}
          />
        ) : (
          <React.Fragment>
            {credentials &&
            !credentials.locked &&
            credentials.maskedProjectId ? (
              <p className={style["hint"]}>
                Saved key: {credentials.maskedProjectId}
              </p>
            ) : null}

            {savedButDisabled ? (
              <p className={style["notice"]}>
                A custom key is saved for this network but is not currently
                used. Turn on &quot;Use my Blockfrost key&quot; to activate it.
              </p>
            ) : null}

            <label className={style["label"]} htmlFor="blockfrost-project-id">
              Blockfrost project ID
            </label>
            <Input
              id="blockfrost-project-id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="Enter your Blockfrost project ID"
              disabled={isSaving}
            />

            <div className={style["toggleRow"]}>
              <div>
                <div className={style["toggleTitle"]}>
                  Use my Blockfrost key
                </div>
                <div className={style["toggleHint"]}>
                  When enabled, requests for {network} use your saved project
                  ID.
                </div>
              </div>
              <ToggleSwitchButton
                checked={useCustomKey}
                disabled={isSaving}
                onChange={() => setUseCustomKey((value) => !value)}
              />
            </div>

            <ButtonV2
              variant="dark"
              text={isSaving ? "Saving..." : "Save"}
              disabled={isSaving}
              styleProps={{ width: "100%", marginTop: "16px" }}
              onClick={() => void saveCredentials()}
            />

            <ButtonV2
              variant="light"
              text="Remove saved key"
              disabled={isSaving || !credentials?.hasCustomKey}
              styleProps={{ width: "100%", marginTop: "8px" }}
              onClick={() => void clearCredentials()}
            />
          </React.Fragment>
        )}

        <button
          type="button"
          className={style["helpLink"]}
          onClick={() => setIsHelpOpen(true)}
        >
          How do I get a Blockfrost API key?
        </button>

        {statusMessage ? (
          <p className={style["error"]}>{statusMessage}</p>
        ) : null}
      </div>

      <Modal isOpen={isHelpOpen} toggle={() => setIsHelpOpen(false)} centered>
        <ModalHeader toggle={() => setIsHelpOpen(false)}>
          Blockfrost API key
        </ModalHeader>
        <ModalBody>
          <p>
            Create a free project at{" "}
            <a
              href="https://blockfrost.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              blockfrost.io
            </a>
            , then copy the project ID for the matching Cardano network (
            {network}).
          </p>
          <p>
            Your key is stored encrypted in this wallet. Only a masked version
            is shown after saving.
          </p>
        </ModalBody>
      </Modal>
    </HeaderLayout>
  );
});
