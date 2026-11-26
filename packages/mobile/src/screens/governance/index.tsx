import React, { FunctionComponent, useEffect, useState } from "react";
import { GovernanceCardBody } from "./card";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { View, ViewStyle } from "react-native";
import { useSmartNavigation } from "navigation/smart-navigation";
import { HeaderRightButton } from "components/header";
import { ChipButton } from "components/new/chip";
import { FilterIcon } from "components/new/icon/filter-icon";
import { ProposalFilterModal } from "./filter-modal";
import { PageWithScrollView } from "components/page";
import { InputCardView } from "components/new/card-view/input-card";
import { SearchIcon } from "components/new/icon/search-icon";
import { Governance } from "@keplr-wallet/stores";
import { EmptyView } from "components/new/empty";

export const GovernanceScreen: FunctionComponent = observer(() => {
  const { accountStore, chainStore, queriesStore } = useStore();

  const smartNavigation = useSmartNavigation();

  const style = useStyle();

  const account = accountStore.getAccount(chainStore.current.chainId);

  const [search, setSearch] = useState("");
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const queries = queriesStore.get(chainStore.current.chainId);

  useEffect(() => {
    smartNavigation.setOptions({
      headerRight: () => (
        <HeaderRightButton
          onPress={() => {
            setIsOpenModal(true);
          }}
        >
          <ChipButton
            text="Filter"
            icon={<FilterIcon />}
            iconStyle={style.get("padding-top-2") as ViewStyle}
            containerStyle={
              style.flatten([
                "border-width-1",
                "border-color-white@20%",
              ]) as ViewStyle
            }
            backgroundBlur={false}
          />
        </HeaderRightButton>
      ),
    });
  }, [queries, chainStore, smartNavigation]);

  const sections = (() => {
    let proposals = queries.cosmos.queryGovernance.proposals;

    if (selectedIndex === 1) {
      proposals = proposals.filter(
        (proposal) =>
          proposal.proposalStatus == Governance.ProposalStatus.VOTING_PERIOD
      );
    } else if (selectedIndex === 2) {
      proposals = proposals.filter((proposal) => {
        if (!proposal) {
          return false;
        }

        return (
          queries.cosmos.queryProposalVote.getVote(
            proposal.id,
            account.bech32Address
          ).vote !== "Unspecified"
        );
      });
    } else if (selectedIndex === 3) {
      proposals = proposals.filter(
        (proposal) =>
          proposal.proposalStatus == Governance.ProposalStatus.PASSED ||
          proposal.proposalStatus == Governance.ProposalStatus.REJECTED ||
          proposal.proposalStatus == Governance.ProposalStatus.FAILED
      );
    }

    proposals = proposals.filter(
      (proposal) =>
        proposal.title.toLowerCase().includes(search.trim().toLowerCase()) ||
        proposal.id.includes(search)
    );

    return { data: proposals };
  })();

  return (
    <PageWithScrollView
      backgroundMode="image"
      style={style.flatten(["padding-x-page"]) as ViewStyle}
      containerStyle={style.flatten(["overflow-scroll"]) as ViewStyle}
      contentContainerStyle={style.get("flex-grow-1")}
    >
      <View
        style={style.flatten(["margin-top-16", "margin-bottom-8"]) as ViewStyle}
      >
        <InputCardView
          placeholder="Search by title or Proposal ID"
          placeholderTextColor={"white"}
          value={search}
          onChangeText={(text: string) => {
            setSearch(text);
          }}
          rightIcon={<SearchIcon size={12} />}
        />
      </View>
      {sections.data.length !== 0 ? (
        sections.data.map((proposal) => {
          return (
            <BlurBackground
              key={proposal.id}
              borderRadius={12}
              blurIntensity={16}
              containerStyle={style.flatten(["margin-y-6"]) as ViewStyle}
            >
              <GovernanceCardBody proposalId={proposal.id} />
            </BlurBackground>
          );
        })
      ) : (
        <EmptyView
          containerStyle={style.flatten(["flex-1"])}
          text={
            search.trim().length == 0 ? "No proposals found" : "No search data"
          }
        />
      )}
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <ProposalFilterModal
        isOpen={isOpenModal}
        close={() => setIsOpenModal(false)}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
      />
    </PageWithScrollView>
  );
});

export { GovernanceCardBody };
export * from "./details";
