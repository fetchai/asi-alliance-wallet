import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useRegisterHeader } from "../components/header";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { RegisterSceneBox } from "../components/register-scene-box";
import {
  Body1,
  Body2,
  H3,
  H5,
  Subtitle3,
} from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { YAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Column, Columns } from "../../../components/column";
import { ChainImageFallback } from "../../../components/image";
import { Stack } from "../../../components/stack";
import { Box } from "../../../components/box";
import Color from "color";
import { Styles } from "./styles";
import { WalletIcon } from "../../../components/icon/wallet";
import { Button } from "../../../components/button";
import { useStore } from "../../../stores";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { useNavigate } from "react-router";

export const SelectDerivationPathScene: FunctionComponent<{
  // 한 scene 당 하나의 chain id만 다룬다.
  // 첫번째 chain id를 처리하고나면 남은 chain ids를 다음 scene에 넘긴다.
  // 이런식으로 체이닝해서 처리한다.
  chainIds: string[];
  vaultId: string;

  // "Chains 2/4" 식으로 남은 갯수를 알려줘야하는데
  // 체이닝 기반이라 따로 prop을 안받으면 계산이 어려워진다.
  // 똑같은 prop을 체이닝할때 계속 넘겨준다.
  totalCount: number;

  skipWelcome?: boolean;
}> = observer(({ chainIds, vaultId, totalCount, skipWelcome }) => {
  const header = useRegisterHeader();
  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "step",
        title: "Select Account Derivation Path",
        paragraphs: [
          <Body1 color={ColorPalette["gray-300"]} key="1">
            To use both paths, you need to go through the import process twice.
          </Body1>,
        ],
        stepCurrent: 0,
        stepTotal: 0,
      });
    },
  });

  const { chainStore, keyRingStore } = useStore();

  const navigate = useNavigate();

  const sceneTransition = useSceneTransition();

  const chainId = chainIds[0];
  const chainInfo = chainStore.getChain(chainId);

  const [selectedCoinType, setSelectedCoinType] = useState(-1);

  const [candidates, setCandidates] = useState<
    {
      coinType: number;
      bech32Address: string;
    }[]
  >([]);
  useEffect(() => {
    keyRingStore
      .computeNotFinalizedMnemonicKeyAddresses(vaultId, chainId)
      .then((res) => {
        setCandidates(res);

        if (res.length > 0) {
          setSelectedCoinType(res[0].coinType);
        }
      });
  }, [chainId, keyRingStore, vaultId]);

  return (
    <RegisterSceneBox>
      <YAxis alignX="center">
        <Subtitle3 color={ColorPalette["gray-200"]}>
          {`Chains ${totalCount - chainIds.length + 1}/${totalCount}`}
        </Subtitle3>

        <Gutter size="0.75rem" />

        <Box
          padding="0.75rem 2rem 0.75rem 0.75rem"
          borderRadius="3.5rem"
          backgroundColor={Color(ColorPalette["gray-500"])
            .alpha(0.5)
            .toString()}
        >
          <Columns sum={1} gutter="0.5rem">
            <Box width="2.75rem" height="2.75rem">
              <ChainImageFallback
                alt="chain-image"
                src={chainInfo.chainSymbolImageUrl}
              />
            </Box>

            <Stack gutter="0.25rem">
              <H3>{chainInfo.chainName}</H3>
              <Body2 color={ColorPalette["gray-200"]}>
                {chainInfo.stakeCurrency.coinDenom}
              </Body2>
            </Stack>
          </Columns>
        </Box>

        <Gutter size="1.5rem" />

        <Styles.PathItemList>
          {candidates.map((candidate) => (
            <PathItem
              key={candidate.coinType}
              chainId={chainId}
              coinType={candidate.coinType}
              bech32Address={candidate.bech32Address}
              isSelected={selectedCoinType === candidate.coinType}
              onClick={() => {
                setSelectedCoinType(candidate.coinType);
              }}
            />
          ))}
        </Styles.PathItemList>

        <Gutter size="3rem" />

        <Box width="22.5rem" marginX="auto">
          <Button
            text="Import"
            size="large"
            disabled={
              !keyRingStore.needMnemonicKeyCoinTypeFinalize(
                vaultId,
                chainInfo
              ) || selectedCoinType < 0
            }
            onClick={async () => {
              if (selectedCoinType > 0) {
                await keyRingStore.finalizeMnemonicKeyCoinType(
                  vaultId,
                  chainId,
                  selectedCoinType
                );

                await chainStore.enableChainInfoInUIWithVaultId(
                  vaultId,
                  chainId
                );

                if (chainIds.length > 1) {
                  sceneTransition.replace("select-derivation-path", {
                    vaultId,
                    chainIds: chainIds.slice(1),

                    totalCount,
                  });
                } else {
                  if (skipWelcome) {
                    window.close();
                  } else {
                    navigate("/welcome", {
                      replace: true,
                    });
                  }
                }
              }
            }}
          />
        </Box>
      </YAxis>
    </RegisterSceneBox>
  );
});

const PathItem: FunctionComponent<{
  chainId: string;

  isSelected: boolean;
  coinType: number;
  bech32Address: string;

  onClick: () => void;
}> = observer(({ chainId, isSelected, coinType, bech32Address, onClick }) => {
  const { queriesStore } = useStore();

  const queries = queriesStore.get(chainId);

  return (
    <Styles.ItemContainer
      isSelected={isSelected}
      onClick={(e) => {
        e.preventDefault();

        onClick();
      }}
    >
      <Stack gutter="1rem">
        <Columns sum={1} alignY="center" gutter="1rem">
          <Box padding="0.5rem" style={{ color: ColorPalette["gray-10"] }}>
            <WalletIcon width="1.25rem" height="1.25rem" />
          </Box>

          <Stack gutter="0.25rem">
            <H5>m/44’/{coinType}’</H5>
            <Body2 color={ColorPalette["gray-200"]}>
              {Bech32Address.shortenAddress(bech32Address, 24)}
            </Body2>
          </Stack>
        </Columns>

        <Box style={{ border: `1px solid ${ColorPalette["gray-400"]}` }} />

        <Stack gutter="0.25rem">
          <Columns sum={1} alignY="center">
            <Subtitle3 color={ColorPalette["gray-50"]}>Balance</Subtitle3>
            <Column weight={1}>
              <YAxis alignX="right">
                <Subtitle3 color={ColorPalette["gray-50"]}>
                  {queries.queryBalances
                    .getQueryBech32Address(bech32Address)
                    .stakable.balance.trim(true)
                    .maxDecimals(6)
                    .inequalitySymbol(true)
                    .shrink(true)
                    .toString()}
                </Subtitle3>
              </YAxis>
            </Column>
          </Columns>

          <Columns sum={1} alignY="center">
            <Subtitle3 color={ColorPalette["gray-50"]}>Previous txs</Subtitle3>
            <Column weight={1}>
              <YAxis alignX="right">
                <Subtitle3 color={ColorPalette["gray-50"]}>
                  {
                    queries.cosmos.queryAccount.getQueryBech32Address(
                      bech32Address
                    ).sequence
                  }
                </Subtitle3>
              </YAxis>
            </Column>
          </Columns>
        </Stack>
      </Stack>
    </Styles.ItemContainer>
  );
});
