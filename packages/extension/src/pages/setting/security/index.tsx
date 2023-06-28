import React, { FunctionComponent } from "react";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { Stack } from "../../../components/stack";
import { PageButton } from "../components";
import { RightArrowIcon } from "../../../components/icon";
import { useNavigate } from "react-router";
import { Box } from "../../../components/box";
import { Toggle } from "../../../components/toggle";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { SetDisableAnalyticsMsg } from "@keplr-wallet/background";

export const SettingSecurityPage: FunctionComponent = () => {
  const navigate = useNavigate();

  const [disableAnalytics, setDisableAnalytics] = React.useState<boolean>(
    localStorage.getItem("disable-analytics") === "true"
  );

  return (
    <HeaderLayout title="Security & Privacy" left={<BackButton />}>
      <Box padding="0.75rem" paddingTop="0">
        <Stack gutter="1rem">
          <PageButton
            title="Connected Websites"
            paragraph="Websites that can view your address and make requests for signing"
            endIcon={<RightArrowIcon />}
            onClick={() => navigate("/setting/security/permission")}
          />

          <PageButton
            title="Auto-Lock"
            endIcon={<RightArrowIcon />}
            onClick={() => navigate("/setting/security/auto-lock")}
          />

          <PageButton
            title="Change Password"
            endIcon={<RightArrowIcon />}
            onClick={() => navigate("/setting/security/change-password")}
          />

          <PageButton
            title="Share anonymous data"
            paragraph="Help us improve the performance and quality of Keplr"
            endIcon={
              <Box marginLeft="0.5rem">
                <Toggle
                  isOpen={!disableAnalytics}
                  setIsOpen={() => {
                    const disableAnalytics =
                      localStorage.getItem("disable-analytics") === "true";

                    new InExtensionMessageRequester()
                      .sendMessage(
                        BACKGROUND_PORT,
                        new SetDisableAnalyticsMsg(!disableAnalytics)
                      )
                      .then((analyticsDisabled) => {
                        localStorage.setItem(
                          "disable-analytics",
                          analyticsDisabled ? "true" : "false"
                        );

                        setDisableAnalytics(analyticsDisabled);
                      });
                  }}
                />
              </Box>
            }
          />
        </Stack>
      </Box>
    </HeaderLayout>
  );
};
