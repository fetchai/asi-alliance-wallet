import React, { useState, useEffect, useRef } from "react";
import styles from "./style.module.scss";
import arrowIcon from "@assets/icon/right-arrow.png";

export const FilterActivities: React.FC<{
  onFilterChange: (filter: string[]) => void;
  options: any[];
  selectedFilter: any[];
}> = ({ onFilterChange, options, selectedFilter }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectAllDisabled, setSelectAllDisabled] = useState(false);
  const [unselectAllDisabled, setUnselectAllDisabled] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleCheckboxChange = (value: string) => {
    const newFilters = selectedFilter;
    if (newFilters.includes(value)) {
      onFilterChange(newFilters.filter((item) => item !== value));
    } else {
      onFilterChange([...newFilters, value]);
    }
  };

  const handleDeselectClicks = () => {
    if (selectedFilter.length !== 0) {
      onFilterChange([]);
      setSelectAllDisabled(false);
      setUnselectAllDisabled(true);
    }
  };

  const handleSelectClicks = () => {
    const allFilters = options.map((option) => option.value);
    if (selectedFilter.length !== allFilters.length) {
      onFilterChange(allFilters);
      setSelectAllDisabled(true);
      setUnselectAllDisabled(false);
    }
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setSelectAllDisabled(selectedFilter.length === options.length);
    setUnselectAllDisabled(selectedFilter.length === 0);
  }, [selectedFilter, options]);

  return (
    <div className={styles.dropdown}>
      <div className={styles["dropdown-toggle"]} ref={dropdownRef}>
        <div className={styles["dropdown-heading"]} onClick={toggleDropdown}>
          <span>Filter</span>
          <img src={arrowIcon} alt="Arrow Icon" className={styles.arrowIcon} />
        </div>
        {isOpen && (
          <div className={styles["dropdown-menu-popup"]}>
            <div className={styles.selectGroup}>
              <button
                className={styles.selectButton}
                onClick={handleSelectClicks}
                disabled={selectAllDisabled}
              >
                Select all
              </button>
              <button
                className={styles.selectButton}
                onClick={handleDeselectClicks}
                disabled={unselectAllDisabled}
              >
                Unselect all
              </button>
            </div>
            <div className={styles["dropdown-menu"]}>
              {options.map((option) => (
                <label key={option.value} className={styles["dropdown-item"]}>
                  <input
                    type="checkbox"
                    className="mx-2"
                    value={option.value}
                    checked={selectedFilter.includes(option.value)}
                    onChange={() => handleCheckboxChange(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
