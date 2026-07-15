import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import { CardModal } from "modals/card";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { RectButton } from "components/rect-button";
import { CheckIcon } from "components/new/icon/check";
import { SearchIcon } from "components/new/icon/search-icon";
import { IconButton } from "components/new/button/icon";
import { XmarkIcon } from "components/new/icon/xmark";

interface NetworkItem {
  id: string;
  label: string;
}

interface SelectNetworkProps {
  selectedNetworks: string[];
  disabled: boolean;
  onMultiSelectChange: (ids: string[]) => void;
}

export const SelectNetwork: FunctionComponent<SelectNetworkProps> = observer(
  ({ selectedNetworks, disabled, onMultiSelectChange }) => {
    const style = useStyle();
    const { chainStore } = useStore();

    const networkList: NetworkItem[] = chainStore.chainInfosInUI
      .filter((c) => !c.beta && !c.features?.includes("evm"))
      .map((c) => ({
        id: c.chainId,
        label: c.chainName === "fetch" ? "FetchHub" : c.chainName,
      }));

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
      onMultiSelectChange(networkList.map((n) => n.id));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = networkList.filter((n) =>
      n.label.toLowerCase().includes(search.toLowerCase())
    );

    const selectedSet = new Set(selectedNetworks);
    const allSelected =
      filtered.length > 0 && filtered.every((n) => selectedSet.has(n.id));
    const someSelected = filtered.some((n) => selectedSet.has(n.id));

    const toggle = (id: string) => {
      const next = new Set(selectedSet);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onMultiSelectChange(Array.from(next));
    };

    const toggleAll = () => {
      if (allSelected) {
        const filteredIds = new Set(filtered.map((n) => n.id));
        onMultiSelectChange(
          Array.from(selectedSet).filter((id) => !filteredIds.has(id))
        );
      } else {
        const next = new Set(selectedSet);
        filtered.forEach((n) => next.add(n.id));
        onMultiSelectChange(Array.from(next));
      }
    };

    const triggerLabel = (() => {
      if (selectedNetworks.length === 0) return "Select networks";
      if (selectedNetworks.length === networkList.length)
        return "All networks selected";
      return `${selectedNetworks.length} of ${networkList.length} networks selected`;
    })();

    return (
      <View style={style.flatten(["margin-top-8"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "text-caption2",
              "color-gray-300",
              "margin-bottom-6",
            ]) as ViewStyle
          }
        >
          Select Networks (for which you want to set account name)
        </Text>
        <BlurBackground
          borderRadius={12}
          backgroundBlur={false}
          containerStyle={
            [
              style.flatten([
                "background-color-gray-10",
                "border-width-1",
                "border-color-gray-100",
              ]),
              disabled && { opacity: 0.4 },
            ] as ViewStyle
          }
        >
          <RectButton
            onPress={() => {
              if (!disabled) setIsOpen(true);
            }}
            activeOpacity={0.5}
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "justify-between",
                "padding-x-16",
                "padding-y-14",
                "border-radius-12",
              ]) as ViewStyle
            }
            underlayColor={style.flatten(["color-gray-50"]).color}
          >
            <Text
              style={
                style.flatten([
                  "body3",
                  selectedNetworks.length === 0
                    ? "color-gray-300"
                    : "color-dark",
                ]) as ViewStyle
              }
            >
              {triggerLabel}
            </Text>
            <IconButton
              backgroundBlur={false}
              icon={
                <Text
                  style={
                    style.flatten([
                      "text-caption2",
                      "color-gray-300",
                    ]) as ViewStyle
                  }
                >
                  ▾
                </Text>
              }
              iconStyle={style.flatten(["padding-0"]) as ViewStyle}
            />
          </RectButton>
        </BlurBackground>

        <CardModal
          isOpen={isOpen}
          close={() => {
            setIsOpen(false);
            setSearch("");
          }}
          title="Select Networks"
        >
          <BlurBackground
            borderRadius={12}
            backgroundBlur={false}
            containerStyle={
              style.flatten([
                "flex-row",
                "items-center",
                "padding-x-12",
                "margin-bottom-8",
                "background-color-gray-10",
              ]) as ViewStyle
            }
          >
            <IconButton
              backgroundBlur={false}
              icon={<SearchIcon color="#9A9AA2" size={16} />}
              iconStyle={
                style.flatten(["padding-0", "margin-right-8"]) as ViewStyle
              }
            />
            <TextInput
              style={
                [
                  style.flatten([
                    "flex-1",
                    "body3",
                    "color-dark",
                    "padding-y-12",
                  ]),
                  { outlineWidth: 0 } as any,
                ] as ViewStyle
              }
              placeholder="Search networks..."
              placeholderTextColor={style.flatten(["color-gray-300"]).color}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <XmarkIcon size={12} color="#9A9AA2" />
              </TouchableOpacity>
            )}
          </BlurBackground>

          <BlurBackground
            borderRadius={12}
            backgroundBlur={false}
            containerStyle={
              [
                style.flatten(["margin-bottom-6", "background-color-gray-5"]),
                allSelected && { backgroundColor: "#e0fedd" },
              ] as ViewStyle
            }
          >
            <RectButton
              onPress={toggleAll}
              activeOpacity={0.5}
              style={
                style.flatten([
                  "flex-row",
                  "items-center",
                  "justify-between",
                  "padding-x-16",
                  "padding-y-14",
                  "border-radius-12",
                ]) as ViewStyle
              }
              underlayColor={style.flatten(["color-gray-50"]).color}
            >
              <Text style={style.flatten(["body3", "color-dark"]) as ViewStyle}>
                {allSelected ? "Deselect All" : "Select All Networks"}
              </Text>
              {(allSelected || someSelected) && (
                <CheckIcon color="#151a1a" size={16} />
              )}
            </RectButton>
          </BlurBackground>

          <ScrollView
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filtered.length === 0 ? (
              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-gray-300",
                    "text-center",
                    "padding-y-18",
                  ]) as ViewStyle
                }
              >
                No results
              </Text>
            ) : (
              filtered.map((item) => {
                const selected = selectedSet.has(item.id);
                return (
                  <BlurBackground
                    key={item.id}
                    borderRadius={12}
                    backgroundBlur={false}
                    containerStyle={
                      [
                        style.flatten([
                          "margin-bottom-6",
                          "background-color-gray-5",
                        ]),
                        selected && { backgroundColor: "#e0fedd" },
                      ] as ViewStyle
                    }
                  >
                    <RectButton
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.5}
                      style={
                        style.flatten([
                          "flex-row",
                          "items-center",
                          "justify-between",
                          "padding-x-16",
                          "padding-y-14",
                          "border-radius-12",
                        ]) as ViewStyle
                      }
                      underlayColor={style.flatten(["color-gray-50"]).color}
                    >
                      <Text
                        style={
                          style.flatten([
                            selected ? "h7" : "body3",
                            "color-dark",
                          ]) as ViewStyle
                        }
                      >
                        {item.label}
                      </Text>
                      {selected && <CheckIcon color="#151a1a" size={16} />}
                    </RectButton>
                  </BlurBackground>
                );
              })
            )}
          </ScrollView>
        </CardModal>
      </View>
    );
  }
);
