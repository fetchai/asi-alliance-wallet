import React, { FunctionComponent, useMemo } from "react";
import { CollapsibleList } from "../../components/collapsible-list";
import { MainEmptyView, TokenItem, TokenTitleView } from "./components";
import { Dec } from "@keplr-wallet/unit";
import { ViewToken } from "./index";
import { observer } from "mobx-react-lite";
import { Stack } from "../../components/stack";
import { useStore } from "../../stores";
import { TextButton } from "../../components/button-text";
import { ArrowRightSolidIcon } from "../../components/icon";
import { ColorPalette } from "../../styles";
import { useIntl } from "react-intl";

export const StakedTabView: FunctionComponent = observer(() => {
  const { hugeQueriesStore } = useStore();

  const intl = useIntl();

  const delegations: ViewToken[] = useMemo(
    () =>
      hugeQueriesStore.delegations.filter((token) => {
        return token.token.toDec().gt(new Dec(0));
      }),
    [hugeQueriesStore.delegations]
  );

  const unbondings: {
    viewToken: ViewToken;
    altSentence: string;
  }[] = useMemo(
    () =>
      hugeQueriesStore.unbondings
        .filter((unbonding) => {
          return unbonding.viewToken.token.toDec().gt(new Dec(0));
        })
        .map((unbonding) => {
          const relativeTime = formatRelativeTime(unbonding.completeTime);

          return {
            viewToken: unbonding.viewToken,
            altSentence: intl.formatRelativeTime(
              relativeTime.value,
              relativeTime.unit
            ),
          };
        }),
    [hugeQueriesStore.unbondings, intl]
  );

  const TokenViewData: {
    title: string;
    balance:
      | ViewToken[]
      | {
          viewToken: ViewToken;
          altSentence: string;
        }[];
    lenAlwaysShown: number;
    tooltip?: string | React.ReactElement;
  }[] = [
    {
      title: "Staked Balance",
      balance: delegations,
      lenAlwaysShown: 5,
      tooltip: "Tokens that are delegated to validators and earning rewards.",
    },
    {
      title: "Unstaking Balance",
      balance: unbondings,
      lenAlwaysShown: 3,
      tooltip: "Tokens that are under the unbonding period.",
    },
  ];

  return (
    <React.Fragment>
      <Stack gutter="0.5rem">
        {TokenViewData.map(({ title, balance, lenAlwaysShown, tooltip }) => {
          if (balance.length === 0) {
            return null;
          }

          return (
            <CollapsibleList
              key={title}
              title={<TokenTitleView title={title} tooltip={tooltip} />}
              lenAlwaysShown={lenAlwaysShown}
              items={balance.map((viewToken) => {
                if ("altSentence" in viewToken) {
                  return (
                    <TokenItem
                      viewToken={viewToken.viewToken}
                      key={`${viewToken.viewToken.chainInfo.chainId}-${viewToken.viewToken.token.currency.coinMinimalDenom}`}
                      disabled={
                        !viewToken.viewToken.chainInfo.walletUrlForStaking
                      }
                      onClick={() => {
                        if (viewToken.viewToken.chainInfo.walletUrlForStaking) {
                          browser.tabs.create({
                            url: viewToken.viewToken.chainInfo
                              .walletUrlForStaking,
                          });
                        }
                      }}
                      altSentence={viewToken.altSentence}
                    />
                  );
                }

                return (
                  <TokenItem
                    viewToken={viewToken}
                    key={`${viewToken.chainInfo.chainId}-${viewToken.token.currency.coinMinimalDenom}`}
                    disabled={!viewToken.chainInfo.walletUrlForStaking}
                    onClick={() => {
                      if (viewToken.chainInfo.walletUrlForStaking) {
                        browser.tabs.create({
                          url: viewToken.chainInfo.walletUrlForStaking,
                        });
                      }
                    }}
                  />
                );
              })}
            />
          );
        })}
      </Stack>

      {delegations.length === 0 && unbondings.length === 0 ? (
        <MainEmptyView
          image={
            <img
              src={require("../../public/assets/img/main-empty-staking.png")}
              style={{
                width: "6.25rem",
                height: "6.25rem",
              }}
              alt="empty staking image"
            />
          }
          title="Ready to Start Staking?"
          paragraph="Stake your assets to earn rewards and contribute to maintaining the networks!"
          button={
            <TextButton
              text="Go to Dashboard"
              size="small"
              right={
                <ArrowRightSolidIcon
                  width="1.125rem"
                  height="1.125rem"
                  color={ColorPalette["gray-10"]}
                />
              }
              onClick={async () => {
                await browser.tabs.create({
                  url: "https://wallet.keplr.app",
                });

                close();
              }}
            />
          }
        />
      ) : null}
    </React.Fragment>
  );
});

function formatRelativeTime(time: string): {
  unit: "minute" | "hour" | "day";
  value: number;
} {
  const remaining = new Date(time).getTime() - Date.now();
  if (remaining <= 0) {
    return {
      unit: "minute",
      value: 1,
    };
  }

  const remainingSeconds = remaining / 1000;
  const remainingMinutes = remainingSeconds / 60;
  if (remainingMinutes < 1) {
    return {
      unit: "minute",
      value: 1,
    };
  }

  const remainingHours = remainingMinutes / 60;
  const remainingDays = remainingHours / 24;

  if (remainingDays >= 1) {
    return {
      unit: "day",
      value: Math.ceil(remainingDays),
    };
  }

  if (remainingHours >= 1) {
    return {
      unit: "hour",
      value: Math.ceil(remainingHours),
    };
  }

  return {
    unit: "minute",
    value: Math.ceil(remainingMinutes),
  };
}
