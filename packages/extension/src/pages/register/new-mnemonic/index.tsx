import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { RegisterSceneBox } from "../components/register-scene-box";
import { Button } from "../../../components/button";
import {
  useFixedWidthScene,
  useSceneEvents,
  useSceneTransition,
  VerticalResizeTransition,
} from "../../../components/transition";
import { TextInput } from "../../../components/input";
import { XAxis } from "../../../components/axis";
import { Styles } from "./styles";
import { Gutter } from "../../../components/gutter";
import { Bleed } from "../../../components/bleed";
import { Box } from "../../../components/box";
import { Mnemonic } from "@keplr-wallet/crypto";
import { SetBip44PathCard, useBIP44PathState } from "../components/bip-44-path";
import { observer } from "mobx-react-lite";
import lottie from "lottie-web";
import AnimSeed from "../../../public/assets/lottie/register/seed.json";
import { useRegisterHeader } from "../components/header";
import { HorizontalRadioGroup } from "../../../components/radio-group";
import { VerticalCollapseTransition } from "../../../components/transition/vertical-collapse";
import { WarningBox } from "../../../components/warning-box";
import { CopyToClipboard } from "../components/copy-to-clipboard";

type WordsType = "12words" | "24words";

export const NewMnemonicScene: FunctionComponent = observer(() => {
  const header = useRegisterHeader();
  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "step",
        title: "New Recovery Phrase",
        stepCurrent: 1,
        stepTotal: 3,
      });
    },
  });

  const seedAnimDivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (seedAnimDivRef.current) {
      const anim = lottie.loadAnimation({
        container: seedAnimDivRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: AnimSeed,
      });

      return () => {
        anim.destroy();
      };
    }
  }, []);

  const [policyDelayRemaining, setPolicyDelayRemaining] = useState(3000);
  const [policyVerified, setPolicyVerified] = useState(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setPolicyDelayRemaining((v) => Math.max(v - 1000, 0));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const sceneTransition = useSceneTransition();

  const [wordsType, setWordsType] = useState<WordsType>("12words");

  const fixedWidthScene = useFixedWidthScene();
  useEffect(() => {
    if (wordsType === "24words") {
      fixedWidthScene.setWidth("41.5rem");
    } else {
      fixedWidthScene.setWidth(undefined);
    }
  }, [fixedWidthScene, wordsType]);

  const [words, setWords] = useState<string[]>([]);

  useEffect(() => {
    const rng = (array: any) => {
      return Promise.resolve(crypto.getRandomValues(array));
    };

    if (wordsType === "12words") {
      Mnemonic.generateSeed(rng, 128).then((str) => setWords(str.split(" ")));
    } else if (wordsType === "24words") {
      Mnemonic.generateSeed(rng, 256).then((str) => setWords(str.split(" ")));
    } else {
      throw new Error(`Unknown words type: ${wordsType}`);
    }
  }, [wordsType]);

  const bip44PathState = useBIP44PathState();
  const [isBIP44CardOpen, setIsBIP44CardOpen] = useState(false);

  return (
    <RegisterSceneBox>
      <Box position="relative">
        {!policyVerified ? (
          <BlurBackdrop>
            <div
              style={{ width: "10rem", height: "10rem" }}
              ref={seedAnimDivRef}
            />
          </BlurBackdrop>
        ) : null}
        <Box alignX="center">
          <HorizontalRadioGroup
            size="large"
            selectedKey={wordsType}
            onSelect={(key) => {
              setWordsType(key as WordsType);
            }}
            items={[
              {
                key: "12words",
                text: "12 words",
              },
              {
                key: "24words",
                text: "24 words",
              },
            ]}
            itemMinWidth="6.25rem"
          />
        </Box>
        <Gutter size="1rem" />
        <Bleed left="1rem">
          <VerticalResizeTransition>
            <Styles.WordsGridContainer columns={words.length > 12 ? 4 : 3}>
              {words.map((word, i) => {
                return (
                  <XAxis key={i} alignY="center">
                    <Styles.IndexText>{i + 1}.</Styles.IndexText>
                    <TextInput value={word} readOnly={true} />
                  </XAxis>
                );
              })}
            </Styles.WordsGridContainer>
            <Gutter size="1rem" />
          </VerticalResizeTransition>
        </Bleed>

        <CopyToClipboard text={words.join(" ")} />

        <Gutter size="1.625rem" />
      </Box>

      <Box>
        <WarningBox
          title="DO NOT share your recovery phrase with ANYONE."
          paragraph="Anyone with your recovery phrase can take your assets. Please stay vigilant against phishing attacks at all times."
        />

        <WarningBox
          title="Back up the phrase safely."
          paragraph="You will lose your assets if you lose your recovery phrase. We recommend you always store it offline. Keplr does not store your recovery phrase."
        />
      </Box>

      <Gutter size="1.5rem" />

      <Box width="27.25rem" marginX="auto">
        <VerticalCollapseTransition width="100%" collapsed={isBIP44CardOpen}>
          <Box alignX="center">
            <Button
              size="small"
              color="secondary"
              text="Advanced"
              disabled={!policyVerified}
              onClick={() => {
                setIsBIP44CardOpen(true);
              }}
            />
          </Box>
        </VerticalCollapseTransition>
        <VerticalCollapseTransition collapsed={!isBIP44CardOpen}>
          <SetBip44PathCard
            state={bip44PathState}
            onClose={() => {
              setIsBIP44CardOpen(false);
            }}
          />
        </VerticalCollapseTransition>
      </Box>
      <Gutter size="1.25rem" />
      <Box width="22.5rem" marginX="auto">
        {policyVerified ? (
          <Button
            text="Next"
            size="large"
            onClick={() => {
              if (words.join(" ").trim() !== "") {
                sceneTransition.push("verify-mnemonic", {
                  mnemonic: words.join(" "),
                  bip44Path: bip44PathState.getPath(),
                  stepPrevious: 1,
                  stepTotal: 3,
                });
              }
            }}
          />
        ) : (
          <Button
            text={`I understood. Show my phrase.${
              policyDelayRemaining > 0
                ? ` (${Math.ceil(policyDelayRemaining / 1000)})`
                : ""
            }`}
            size="large"
            disabled={policyDelayRemaining > 0}
            onClick={() => {
              setPolicyVerified(true);
            }}
          />
        )}
      </Box>
    </RegisterSceneBox>
  );
});

const BlurBackdrop: FunctionComponent = ({ children }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "-1.625rem",
        bottom: 0,
        left: "-1rem",
        right: "-1rem",
        backgroundImage: `url(${require("../../../public/assets/img/register-new-recovery-phrase-blur.png")})`,
        backgroundSize: "cover",
        borderRadius: "1rem",
        zIndex: 1000,

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
};
