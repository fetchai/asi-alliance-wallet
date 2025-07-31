import React, {
  FunctionComponent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { BIP44Option } from "./bip44-option";
import { useStyle } from "styles/index";
import { Text, View, ViewStyle } from "react-native";
import { InputCardView } from "components/new/card-view/input-card";

const useZeroOrPositiveIntegerString = (initialValue: string) => {
  const [value, setValue] = useState(initialValue);

  return {
    value,
    setValue: useCallback((text: string) => {
      if (!text) {
        setValue("0");
        return;
      }

      const num = Number.parseInt(text);
      if (!Number.isNaN(num) && num >= 0) {
        setValue(num.toString());
      }
    }, []),
    isValid: useMemo(() => {
      if (!value) {
        return false;
      }

      const num = Number.parseInt(value);
      return !Number.isNaN(num) && num >= 0;
    }, [value]),
    number: useMemo(() => {
      return Number.parseInt(value);
    }, [value]),
  };
};

export const BIP44AdvancedButton: FunctionComponent<{
  bip44Option: BIP44Option;
  selected?: boolean;
}> = ({ bip44Option, selected }) => {
  const style = useStyle();
  const change = useZeroOrPositiveIntegerString(bip44Option.change.toString());
  const isChangeZeroOrOne =
    change.isValid && (change.number === 0 || change.number === 1);

  const [accountInput, setAccountInput] = useState<string>(
    bip44Option.account.toString()
  );
  const [changeInput, setChangeInput] = useState<string>(
    bip44Option.change.toString()
  );
  const [indexInput, setIndexInput] = useState<string>(
    bip44Option.index.toString()
  );

  return (
    <React.Fragment>
      {selected ? (
        <React.Fragment>
          <Text
            style={
              style.flatten([
                "body2",
                "color-gray-200",
                "font-medium",
                "margin-bottom-18",
              ]) as ViewStyle
            }
          >
            HD Derivation Path
          </Text>
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "margin-bottom-16",
              ]) as ViewStyle
            }
          >
            <Text
              style={
                style.flatten([
                  "body2",
                  "color-white",
                  "margin-right-4",
                ]) as ViewStyle
              }
            >{`m/44’/${bip44Option.coinType ?? "···"}’/`}</Text>
            <InputCardView
              value={accountInput}
              containerStyle={style.flatten(["min-width-72"]) as ViewStyle}
              keyboardType="number-pad"
              onChangeText={(value: string) => {
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (Number.isInteger(parsed) && parsed >= 0) {
                    bip44Option.setAccount(parsed);
                    setAccountInput(parsed.toString());
                  }
                } else {
                  bip44Option.setAccount(0);
                  setAccountInput("0");
                }
              }}
            />
            <Text
              style={style.flatten(["color-white", "margin-x-4"]) as ViewStyle}
            >
              ’/
            </Text>
            <InputCardView
              value={changeInput}
              containerStyle={style.flatten(["min-width-72"]) as ViewStyle}
              keyboardType="number-pad"
              onChangeText={(value: string) => {
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (
                    Number.isInteger(parsed) &&
                    (parsed === 0 || parsed === 1)
                  ) {
                    bip44Option.setChange(parsed);
                    setChangeInput(parsed.toString());
                  }
                } else {
                  bip44Option.setChange(0);
                  setChangeInput("0");
                }
              }}
            />
            <Text
              style={style.flatten(["color-white", "margin-x-4"]) as ViewStyle}
            >
              /
            </Text>
            <InputCardView
              value={indexInput}
              containerStyle={style.flatten(["min-width-72"]) as ViewStyle}
              keyboardType="number-pad"
              onChangeText={(value: string) => {
                if (value) {
                  if (value !== "0") {
                    // Remove leading zeros
                    for (let i = 0; i < value.length; i++) {
                      if (value[i] === "0") {
                        value = value.replace("0", "");
                      } else {
                        break;
                      }
                    }
                  }
                  const parsed = parseFloat(value);
                  // Should be integer and positive.
                  if (Number.isInteger(parsed) && parsed >= 0) {
                    bip44Option.setIndex(parsed);
                    setIndexInput(parsed.toString());
                  }
                } else {
                  bip44Option.setIndex(0);
                  setIndexInput("0");
                }
              }}
            />
          </View>
          {change.isValid && !isChangeZeroOrOne ? (
            <Text
              style={
                style.flatten([
                  "text-caption2",
                  "color-red-250",
                  "margin-bottom-8",
                ]) as ViewStyle
              }
            >
              Change should be 0 or 1
            </Text>
          ) : null}
        </React.Fragment>
      ) : null}
    </React.Fragment>
  );
};
