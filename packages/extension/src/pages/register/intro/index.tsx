import React, { FunctionComponent } from "react";
import { RegisterSceneBox } from "../components/register-scene-box";
import { Stack } from "../../../components/stack";
import { Button } from "../../../components/button";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { useRegisterHeader } from "../components/header";
import { YAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { TextButton } from "../../../components/button-text";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";

export const RegisterIntroScene: FunctionComponent = observer(() => {
  const { uiConfigStore } = useStore();
  const sceneTransition = useSceneTransition();

  const header = useRegisterHeader();
  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "intro",
      });
    },
  });

  return (
    <RegisterSceneBox>
      <YAxis alignX="center">
        <video width="200" height="200" autoPlay={true} loop={true}>
          <source
            src={require("../../../public/assets/lottie/register/intro.webm")}
          />
        </video>
      </YAxis>
      <Gutter size="3.125rem" />
      <Stack gutter="1.25rem">
        <Button
          text="Create a new wallet"
          size="large"
          onClick={() => {
            sceneTransition.push("new-user");
          }}
        />
        <Button
          text="Import an existing wallet"
          size="large"
          color="secondary"
          onClick={() => {
            sceneTransition.push("existing-user");
          }}
        />
        {uiConfigStore.platform !== "firefox" ? (
          <TextButton
            text="Connect Hardware Wallet"
            size="large"
            onClick={() => {
              sceneTransition.push("connect-hardware-wallet");
            }}
          />
        ) : null}
      </Stack>
    </RegisterSceneBox>
  );
});
