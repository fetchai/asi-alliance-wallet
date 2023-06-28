import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo, useState } from "react";
import { BackButton } from "../../../layouts/header/components";
import { HeaderLayout } from "../../../layouts/header";
import styled from "styled-components";
import { Stack } from "../../../components/stack";
import { SearchTextInput } from "../../../components/input";
import { useStore } from "../../../stores";
import { TokenItem } from "../../main/components";
import { Column, Columns } from "../../../components/column";
import { Body2 } from "../../../components/typography";
import { Checkbox } from "../../../components/checkbox";
import { ColorPalette } from "../../../styles";
import { Dec } from "@keplr-wallet/unit";
import { useFocusOnMount } from "../../../hooks/use-focus-on-mount";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router";

const Styles = {
  Container: styled(Stack)`
    padding: 0.75rem;
  `,
};

export const SendSelectAssetPage: FunctionComponent = observer(() => {
  const { hugeQueriesStore } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramIsIBCTransfer = searchParams.get("isIBCTransfer");

  const [search, setSearch] = useState("");
  const [hideIBCToken, setHideIBCToken] = useState(false);

  const searchRef = useFocusOnMount<HTMLInputElement>();

  const tokens = hugeQueriesStore.getAllBalances(!hideIBCToken);

  const filteredTokens = useMemo(() => {
    const zeroDec = new Dec(0);
    const newTokens = tokens.filter((token) => {
      return token.token.toDec().gt(zeroDec);
    });

    const trimSearch = search.trim();

    if (!trimSearch) {
      return newTokens;
    }

    const filtered = newTokens.filter((token) => {
      return (
        token.chainInfo.chainName
          .toLowerCase()
          .includes(trimSearch.toLowerCase()) ||
        token.token.currency.coinDenom
          .toLowerCase()
          .includes(trimSearch.toLowerCase())
      );
    });

    if (paramIsIBCTransfer) {
      return filtered.filter((token) => {
        return token.chainInfo.hasFeature("ibc-transfer");
      });
    }

    return filtered;
  }, [paramIsIBCTransfer, search, tokens]);

  return (
    <HeaderLayout title="Select Asset" left={<BackButton />}>
      <Styles.Container gutter="0.5rem">
        <SearchTextInput
          ref={searchRef}
          placeholder="Search for asset or chain"
          value={search}
          onChange={(e) => {
            e.preventDefault();

            setSearch(e.target.value);
          }}
        />

        <Columns sum={1} gutter="0.25rem">
          <Column weight={1} />
          <Body2
            onClick={() => setHideIBCToken(!hideIBCToken)}
            style={{ color: ColorPalette["gray-300"], cursor: "pointer" }}
          >
            Hide IBC token
          </Body2>
          <Checkbox
            size="small"
            checked={hideIBCToken}
            onChange={setHideIBCToken}
          />
        </Columns>

        {filteredTokens.map((viewToken) => {
          return (
            <TokenItem
              viewToken={viewToken}
              key={`${viewToken.chainInfo.chainId}-${viewToken.token.currency.coinMinimalDenom}`}
              onClick={() => {
                if (paramIsIBCTransfer === "true") {
                  navigate(
                    `/ibc-transfer?chainId=${viewToken.chainInfo.chainId}&coinMinimalDenom=${viewToken.token.currency.coinMinimalDenom}`
                  );
                } else {
                  navigate(
                    `/send?chainId=${viewToken.chainInfo.chainId}&coinMinimalDenom=${viewToken.token.currency.coinMinimalDenom}`
                  );
                }
              }}
            />
          );
        })}
      </Styles.Container>
    </HeaderLayout>
  );
});
