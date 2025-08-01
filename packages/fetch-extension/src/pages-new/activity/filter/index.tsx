import React, { useRef } from "react";
import styles from "./style.module.scss";
import { Dropdown } from "@components-v2/dropdown";
import { Card } from "@components-v2/card";
import { ButtonV2 } from "@components-v2/buttons/button";

export const FilterActivities: React.FC<{
  onFilterChange: (filter: string[]) => void;
  options?: any[];
  selectedFilter?: any[];
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isOpen: boolean;
}> = ({ setIsOpen, isOpen }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };
  return (
    <div className={styles["dropdown-container"]}>
      <div
        className={styles["dropdown"]}
        onClick={toggleDropdown}
        ref={dropdownRef}
      >
        <div className={styles["dropdownToggle"]} ref={dropdownRef}>
          <div className={styles["dropdownHeading"]}>
            <img
              src={require("@assets/svg/wireframe/filter.svg")}
              alt="filter"
              className={styles["arrowIcon"]}
            />
            Filter
          </div>
        </div>
      </div>
    </div>
  );
};

interface FilterDropdownProps {
  isOpen: boolean;
  setIsOpen: any;
  options: any;
  selectedFilter: any;
  handleCheckboxChange: any;
  handleSaveChanges: any;
  isSelectAll: boolean;
  handleSelectClicks: any;
  handleDeselectClicks: any;
  isSaveChangesButtonDisabled: boolean;
  closeClicked?: any;
}
export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  isOpen,
  setIsOpen,
  options,
  selectedFilter,
  handleCheckboxChange,
  handleSaveChanges,
  isSelectAll,
  handleSelectClicks,
  handleDeselectClicks,
  isSaveChangesButtonDisabled,
  closeClicked,
}) => {
  return (
    <Dropdown
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={"Filters"}
      closeClicked={
        closeClicked
          ? closeClicked
          : () => {
              setIsOpen(false);
            }
      }
      styleProp={{ position: "block" }}
    >
      <div className={styles["dropdownMenu"]}>
        {options.map((option: any) => (
          <label key={option.value} className={styles["dropdownItem"]}>
            <Card
              leftImage={option.icon}
              leftImageStyle={{
                height: "18px",
                width: "18px",
                borderRadius: 0,
                padding: "1px",
              }}
              style={
                selectedFilter.includes(option.value)
                  ? {
                      width: "100%",
                      background: "var(--bg-green-light)",
                    }
                  : {
                      width: "100%",
                      background: "var(--card-bg)",
                      cursor: "pointer",
                    }
              }
              rightContent={
                <React.Fragment>
                  <input
                    type="checkbox"
                    className={styles["hidden"]}
                    value={option.value}
                    checked={selectedFilter.includes(option.value)}
                    onChange={() => handleCheckboxChange(option.value)}
                  />
                  {selectedFilter.includes(option.value) && (
                    <img
                      src={require("@assets/svg/wireframe/filter-check.svg")}
                      alt=""
                    />
                  )}
                </React.Fragment>
              }
              heading={option.label}
            />
          </label>
        ))}
      </div>
      <div>
        <ButtonV2
          styleProps={{
            minHeight: "56px",
          }}
          onClick={!isSelectAll ? handleSelectClicks : handleDeselectClicks}
          text={!isSelectAll ? "Select all" : "Unselect all"}
        />
        <ButtonV2
          variant="dark"
          styleProps={{
            minHeight: "56px",
            background: isSaveChangesButtonDisabled
              ? "var(--bg-grey-dark)"
              : "var(--bg-dark)",
            color: isSaveChangesButtonDisabled ? "var(--neutral)" : "white",
            opacity: 1,
          }}
          disabled={isSaveChangesButtonDisabled}
          onClick={handleSaveChanges}
          text="Apply Filters"
        />
      </div>
    </Dropdown>
  );
};
