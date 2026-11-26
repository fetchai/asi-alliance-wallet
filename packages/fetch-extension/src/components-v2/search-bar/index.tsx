import React, { useState, useEffect } from "react";
import style from "./style.module.scss";
import { Card } from "@components-v2/card";
import { _DeepReadonlyArray } from "utility-types/dist/mapped-types";
import { AddressBookData } from "@keplr-wallet/hooks";

interface Props {
  searchTerm: string;
  valuesArray: any[] | _DeepReadonlyArray<any>;
  renderResult: (value: any, index: number) => React.ReactNode;
  onSearchTermChange: (term: string) => void;
  itemsStyleProp?: any;
  filterFunction: any;
  midElement?: React.ReactNode;
  emptyContent?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({
  searchTerm,
  placeholder,
  valuesArray,
  renderResult,
  onSearchTermChange,
  emptyContent,
  itemsStyleProp,
  filterFunction,
  midElement,
  disabled,
}) => {
  const [suggestedValues, setSuggestedValues] = useState<
    any[] | _DeepReadonlyArray<AddressBookData>
  >([]);

  useEffect(() => {
    const searchTermLower = searchTerm.toLowerCase();

    if (searchTermLower === "") {
      setSuggestedValues(valuesArray);
    } else {
      const filteredValues = filterFunction(valuesArray, searchTermLower);
      setSuggestedValues(filteredValues);
    }
  }, [searchTerm, valuesArray]);

  return (
    <div>
      <Card
        style={{
          background: "var(--card-bg)",
          marginBottom: "24px",
          padding: "12px 18px",
        }}
        heading={
          <input
            className={style["searchInput"]}
            type="text"
            id="searchInput"
            placeholder={placeholder || "Search"}
            value={searchTerm}
            disabled={disabled}
            onChange={(e) => onSearchTermChange(e.target.value)}
          />
        }
        rightContent={require("@assets/svg/wireframe/search.svg")}
      />
      {midElement && (
        <div
          style={{
            marginBottom: "24px",
          }}
        >
          {midElement}
        </div>
      )}

      {suggestedValues.length > 0 ? (
        <div style={itemsStyleProp}>
          {suggestedValues.map((value, index) => (
            <div key={index}>{renderResult(value, index)}</div>
          ))}
        </div>
      ) : (
        searchTerm.length > 0 &&
        (emptyContent ? (
          emptyContent
        ) : (
          <div className={style["noResults"]}>No results found!</div>
        ))
      )}
    </div>
  );
};
