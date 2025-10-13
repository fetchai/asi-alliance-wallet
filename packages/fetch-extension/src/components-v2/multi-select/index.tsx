import React, { useEffect, useRef, useState } from "react";
import styles from "./style.module.scss";
import classNames from "classnames";

export type MultiSelectItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

interface MultiSelectProps {
  items: MultiSelectItem[];
  disabled?: boolean;
  placeholder?: string;
  value?: string[];
  onChange?: (selectedIds: string[]) => void;
  className?: string;
  maxVisibleLabelCount?: number;
  showSelectAll?: boolean;
  selectAllLabel?: string;
  onSelectAll?: (selected: boolean) => void;
}

export const MultiSelectDropdown: React.FC<MultiSelectProps> = ({
  items,
  placeholder = "Select",
  value,
  onChange,
  className = "",
  disabled = false,
  maxVisibleLabelCount = 2,
  showSelectAll = false,
  selectAllLabel = "Select All",
  onSelectAll,
}) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(value ?? []));
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (value) setSelected(new Set(value));
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const toggleItem = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    if (!value) setSelected(next);
    onChange?.(Array.from(next));

    const nextAllSelected = allSelectable.every((i) => next.has(i.id));
    onSelectAll?.(nextAllSelected);
  };

  const clearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = new Set<string>();
    if (!value) setSelected(next);
    onChange?.([]);
    onSelectAll?.(false);
  };

  const selectedLabels = items
    .filter((it) => selected.has(it.id))
    .map((i) => i.label);

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase())
  );

  const allSelectable = filteredItems.filter((i) => !i.disabled);
  const allSelected =
    allSelectable.length > 0 &&
    allSelectable.every((item) => selected.has(item.id));

  const handleSelectAllToggle = () => {
    let next: Set<string>;
    if (allSelected) {
      next = new Set(
        [...selected].filter((id) => !allSelectable.some((i) => i.id === id))
      );
      onSelectAll?.(false);
    } else {
      next = new Set([...selected, ...allSelectable.map((item) => item.id)]);
      onSelectAll?.(true);
    }
    if (!value) setSelected(next);
    onChange?.(Array.from(next));
  };

  const someSelected =
    allSelectable.some((item) => selected.has(item.id)) && !allSelected;

  return (
    <div className={`${styles["select-root"]} ${className}`} ref={rootRef}>
      <button
        className={`${styles["select-control"]} ${open ? styles["open"] : ""} ${
          disabled ? styles["select-disabled"] : ""
        }`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <div className={styles["select-value"]}>
          {selectedLabels.length === 0 ? (
            <span className={styles["select-placeholder"]}>{placeholder}</span>
          ) : (
            <div className={styles["select-tags"]}>
              {selectedLabels
                .slice(0, maxVisibleLabelCount)
                .map((label, idx) => (
                  <span
                    className={styles["select-tag"]}
                    key={idx}
                    title={label}
                  >
                    {label}
                  </span>
                ))}
              {selectedLabels.length > maxVisibleLabelCount && (
                <span className={styles["select-more"]}>
                  +{selectedLabels.length - maxVisibleLabelCount}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={styles["select-actions"]}>
          {selected.size > 0 && (
            <span
              className={styles["select-clear"]}
              style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              onClick={clearAll}
              aria-label="Clear selection"
            >
              <img
                src={require("@assets/svg/wireframe/xmark.svg")}
                style={{ width: "10px", height: "10px" }}
              />
            </span>
          )}
          <span className={styles["select-caret"]}>
            <img
              src={require("@assets/svg/wireframe/chevron-down.svg")}
              style={{ width: "10px", height: "10px" }}
            />
          </span>
        </div>
      </button>

      {open && (
        <div className={styles["select-dropdown"]}>
          <div className={styles["select-search"]}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles["select-search-input"]}
            />
          </div>

          <ul
            className={styles["select-list"]}
            role="listbox"
            aria-multiselectable
          >
            {showSelectAll && filteredItems.length > 0 && (
              <li
                className={classNames(
                  styles["select-item"],
                  allSelected ? styles["selected"] : "",
                  styles["select-all-option"]
                )}
                onClick={handleSelectAllToggle}
                role="option"
                aria-selected={allSelected}
              >
                <span className={styles["select-item-label"]}>
                  {selectAllLabel}
                </span>
                <label className={styles["select-checkbox-wrapper"]}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                  />
                  <span
                    className={classNames(
                      styles["select-checkbox"],
                      someSelected && styles["minus"]
                    )}
                    aria-hidden
                  />
                </label>
              </li>
            )}

            {filteredItems.length === 0 ? (
              <li className={styles["select-empty"]}>No results</li>
            ) : (
              filteredItems.map((item) => (
                <li
                  key={item.id}
                  className={`${styles["select-item"]} ${
                    selected.has(item.id) ? styles["selected"] : ""
                  } ${item.disabled ? styles["disabled"] : ""}`}
                  role="option"
                  aria-selected={selected.has(item.id)}
                  onClick={() => !item.disabled && toggleItem(item.id)}
                >
                  <span className={styles["select-item-label"]}>
                    {item.label}
                  </span>
                  <label className={styles["select-checkbox-wrapper"]}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      readOnly
                      tabIndex={-1}
                      aria-hidden
                    />
                    <span
                      className={classNames(styles["select-checkbox"])}
                      aria-hidden
                    />
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
