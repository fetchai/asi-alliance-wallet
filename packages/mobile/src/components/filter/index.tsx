import React, {
  FunctionComponent,
  ReactElement,
  useEffect,
  useState,
} from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconButton } from "components/new/button/icon";
import { RectButton } from "components/rect-button";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { Button } from "components/button";
import { CheckIcon } from "components/icon";
import { useStore } from "stores/index";

export interface FilterItem {
  icon?: ReactElement;
  isSelected: boolean;
  title: string;
  value: string;
}

export const FilterView: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  filters: FilterItem[];
  handleFilterChange: (selectedFilters: FilterItem[]) => void;
  options: FilterItem[];
}> = ({ isOpen, close, filters, handleFilterChange, options }) => {
  const style = useStyle();
  const { chainStore, activityStore, accountStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);

  const [selectedFilter, setSelectedFilter] = useState<FilterItem[]>([]);

  const accountOrChainChanged =
    activityStore.getAddress !== accountInfo.bech32Address ||
    activityStore.getChainId !== current.chainId;

  useEffect(() => {
    setSelectedFilter(options);
  }, [accountOrChainChanged]);

  useEffect(() => {
    setSelectedFilter(filters);
  }, [isOpen]);

  const handleClicks = () => {
    const anyUnselected = selectedFilter.some(
      (filter: { isSelected: boolean }) => !filter.isSelected
    );
    const updatedFilters: FilterItem[] = selectedFilter.map(
      (filter: FilterItem) => ({
        ...filter,
        isSelected: anyUnselected,
      })
    );
    setSelectedFilter(updatedFilters);
  };

  const allSelected = selectedFilter.every(
    (filter: { isSelected: boolean }) => filter.isSelected
  );
  const selectAllButtonText = allSelected ? "Unselect all" : "Select all";

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal isOpen={isOpen} title="Filter" close={close}>
      <Button
        text={selectAllButtonText}
        size="small"
        textStyle={style.flatten(["color-white", "body3"]) as ViewStyle}
        containerStyle={
          style.flatten([
            "border-radius-64",
            "background-color-transparent",
            "border-width-1",
            "border-color-gray-400",
          ]) as ViewStyle
        }
        onPress={handleClicks}
      />
      <View
        style={
          style.flatten(["margin-top-24", "margin-bottom-18"]) as ViewStyle
        }
      >
        {options.map((item: FilterItem, index: number) => (
          <BlurBackground
            key={index}
            borderRadius={12}
            blurIntensity={15}
            containerStyle={
              style.flatten([
                "margin-bottom-6",
                selectedFilter[index]?.isSelected ?? false
                  ? "background-color-indigo"
                  : "background-color-transparent",
              ]) as ViewStyle
            }
          >
            <RectButton
              onPress={() => {
                const updatedFilters: FilterItem[] = selectedFilter.map(
                  (filter: FilterItem, tempIndex) => ({
                    ...filter,
                    isSelected:
                      index === tempIndex
                        ? !filter.isSelected
                        : filter.isSelected,
                  })
                );
                setSelectedFilter(updatedFilters);
              }}
              activeOpacity={0.5}
              underlayColor={style.flatten(["color-indigo"]).color}
            >
              <View
                style={
                  style.flatten([
                    "flex-row",
                    "items-center",
                    "padding-18",
                  ]) as ViewStyle
                }
              >
                {item.icon && (
                  <IconButton
                    backgroundBlur={false}
                    icon={item.icon}
                    iconStyle={
                      style.flatten([
                        "width-32",
                        "height-32",
                        "items-center",
                        "justify-center",
                      ]) as ViewStyle
                    }
                  />
                )}
                <Text
                  style={
                    style.flatten([
                      "body3",
                      "margin-left-18",
                      "color-white",
                    ]) as ViewStyle
                  }
                >
                  {item.title}
                </Text>
                {selectedFilter[index].isSelected && (
                  <View
                    style={style.flatten(["flex-1", "items-end"]) as ViewStyle}
                  >
                    <CheckIcon color={"transparent"} />
                  </View>
                )}
              </View>
            </RectButton>
          </BlurBackground>
        ))}
      </View>
      <Button
        text="Save changes"
        size="large"
        containerStyle={style.flatten(["border-radius-64"]) as ViewStyle}
        textStyle={style.flatten(["body2"]) as ViewStyle}
        rippleColor="black@50%"
        disabled={filters == selectedFilter}
        onPress={() => handleFilterChange(selectedFilter)}
      />
    </CardModal>
  );
};
