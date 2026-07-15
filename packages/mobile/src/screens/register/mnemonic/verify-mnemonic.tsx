import React, { FunctionComponent, useEffect, useState } from "react";
import { PageWithScrollView } from "components/page";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";
import { WordChip } from "components/mnemonic";
import { Button } from "components/button";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useSmartNavigation } from "navigation/smart-navigation";
import { NewMnemonicConfig } from "./hook";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { BIP44AdvancedButton, useBIP44Option } from "screens/register/bip44";
import { BipButtons } from "screens/register/bip-button";

export const VerifyMnemonicScreen: FunctionComponent = () => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
          newMnemonicConfig: NewMnemonicConfig;
        }
      >,
      string
    >
  >();

  const style = useStyle();

  const smartNavigation = useSmartNavigation();
  const registerConfig = route.params.registerConfig;
  const newMnemonicConfig = route.params.newMnemonicConfig;

  const bip44Option = useBIP44Option();

  const [candidateWords, setCandidateWords] = useState<
    {
      word: string;
      usedIndex: number;
    }[]
  >([]);
  const [wordSet, setWordSet] = useState<(string | undefined)[]>([]);
  const [selectedDerivationPath, setIsSelectedDerivationPath] = useState(false);

  useEffect(() => {
    const words = newMnemonicConfig.mnemonic.split(" ");
    const randomSortedWords = words.slice().sort(() => {
      return Math.random() > 0.5 ? 1 : -1;
    });

    const candidateWords = randomSortedWords.slice();
    setCandidateWords(
      candidateWords.map((word) => {
        return {
          word,
          usedIndex: -1,
        };
      })
    );

    setWordSet(
      newMnemonicConfig.mnemonic.split(" ").map((_) => {
        return undefined;
      })
    );
  }, [newMnemonicConfig.mnemonic]);

  const firstEmptyWordSetIndex = wordSet.findIndex(
    (word) => word === undefined
  );

  const [isCreating, setIsCreating] = useState(false);

  const renderButtonItem = ({ item, index }: any) => {
    return (
      <WordButton
        key={index}
        word={item.word}
        used={item.usedIndex >= 0}
        onPress={() => {
          const newWordSet = wordSet.slice();
          const newCandiateWords = candidateWords.slice();
          if (item.usedIndex < 0) {
            if (firstEmptyWordSetIndex < 0) {
              return;
            }

            newWordSet[firstEmptyWordSetIndex] = item.word;
            setWordSet(newWordSet);

            newCandiateWords[index].usedIndex = firstEmptyWordSetIndex;
            setCandidateWords(newCandiateWords);
          } else {
            newWordSet[item.usedIndex] = undefined;
            setWordSet(newWordSet);

            newCandiateWords[index].usedIndex = -1;
            setCandidateWords(newCandiateWords);
          }
        }}
      />
    );
  };

  const undefinedFilterList = wordSet.filter((v) => v !== undefined);

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
    >
      <Text
        style={
          style.flatten([
            "h1",
            "color-black",
            "margin-y-18",
            "font-normal",
          ]) as ViewStyle
        }
      >
        Verify your recovery phrase
      </Text>
      <View>
        <WordsCard
          wordSet={wordSet.map((word, i) => {
            return {
              word: word ?? "",
              empty: word === undefined,
              dashed: i === firstEmptyWordSetIndex,
            };
          })}
        />
        <BipButtons
          selected={selectedDerivationPath}
          setIsSelected={setIsSelectedDerivationPath}
          clearButtonDisable={undefinedFilterList.length === 0}
          onPressClearButton={() => {
            const words = newMnemonicConfig.mnemonic.split(" ");
            const randomSortedWords = words.slice().sort(() => {
              return Math.random() > 0.5 ? 1 : -1;
            });

            const candidateWords = randomSortedWords.slice();
            setCandidateWords(
              candidateWords.map((word) => {
                return {
                  word,
                  usedIndex: -1,
                };
              })
            );
            setWordSet(
              words.map((_) => {
                return undefined;
              })
            );
          }}
        />
        <BIP44AdvancedButton
          bip44Option={bip44Option}
          selected={selectedDerivationPath}
        />
      </View>
      <View style={style.flatten(["flex-1"])} />
      <View>
        <FlatList
          data={candidateWords}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderButtonItem}
          numColumns={3}
          scrollEnabled={false}
        />
        <Button
          containerStyle={
            style.flatten([
              "border-radius-32",
              "margin-top-24",
              "background-color-dark",
            ]) as ViewStyle
          }
          text="Continue"
          size="large"
          loading={isCreating}
          disabled={wordSet.join(" ") !== newMnemonicConfig.mnemonic}
          textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
          onPress={async () => {
            setIsCreating(true);
            smartNavigation.navigateSmart("Register.CreateAccount", {
              registerConfig: registerConfig,
              mnemonic: encodeURIComponent(
                JSON.stringify(newMnemonicConfig.mnemonic.trim())
              ),
              bip44HDPath: bip44Option.bip44HDPath,
            });
            setIsCreating(false);
          }}
        />
        {/*naive supreme token farm hand panic ketchup wisdom little choice valid home*/}
        <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      </View>
      {/* Mock element for bottom padding */}
    </PageWithScrollView>
  );
};

const WordButton: FunctionComponent<{
  word: string;
  used: boolean;
  onPress: () => void;
}> = ({ word, used, onPress }) => {
  const style = useStyle();

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={style.flatten(["flex-1", "margin-4"]) as ViewStyle}
    >
      <BlurBackground
        backgroundBlur={false}
        containerStyle={
          [
            style.flatten([
              "padding-y-8",
              "items-center",
              "border-radius-64",
              "border-width-1",
              "border-color-gray-100",
            ]),
            used && { backgroundColor: "#e8e8e8" },
          ] as ViewStyle
        }
      >
        <Text
          style={
            style.flatten(
              ["text-caption2"],
              [used ? "color-gray-300" : "color-dark"]
            ) as ViewStyle
          }
        >
          {word}
        </Text>
      </BlurBackground>
    </TouchableOpacity>
  );
};

const WordsCard: FunctionComponent<{
  wordSet: {
    word: string;
    empty: boolean;
    dashed: boolean;
  }[];
}> = ({ wordSet }) => {
  const renderItem = ({ item, index }: any) => {
    return (
      <WordChip
        key={index.toString()}
        word={item.word}
        empty={item.empty}
        dashedBorder={item.dashed}
      />
    );
  };

  return (
    <FlatList
      data={wordSet}
      keyExtractor={(_, index) => index.toString()}
      renderItem={renderItem}
      numColumns={3}
      scrollEnabled={false}
    />
  );
};
