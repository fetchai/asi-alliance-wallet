import React, { useState, useEffect } from "react";
import style from "./style.module.scss";

interface Tab {
  id: string;
  component?: any;
  disabled?: boolean;
  isActive?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTabId?: string;
  showTabsOnBottom?: boolean;
  setActiveTab?: any;
  onTabChange?: any;
  styleProps?: React.CSSProperties;
  tabHeight?: string;
  tabStyle?: React.CSSProperties;
}

export const TabsPanel: React.FC<TabsProps> = ({
  tabs,
  activeTabId,
  showTabsOnBottom,
  setActiveTab,
  onTabChange,
  styleProps,
  tabHeight,
  tabStyle,
}) => {
  const [selectedTab, setSelectedTab] = useState<string | null>(
    activeTabId || tabs[0].id
  );

  useEffect(() => {
    if (activeTabId) {
      setSelectedTab(activeTabId);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (setActiveTab) {
      setActiveTab(selectedTab);
    }
    if (onTabChange) {
      onTabChange(selectedTab);
    }
  }, [selectedTab, setActiveTab, onTabChange]);

  const handleTabClick = (tabId: string) => {
    setSelectedTab(tabId);
  };

  return (
    <div
      className={style["tab-container"]}
      style={styleProps ? { ...styleProps } : {}}
    >
      {!showTabsOnBottom && (
        <div
          style={tabStyle ? { ...tabStyle } : {}}
          className={style["tab-bar"]}
        >
          {tabs.map((tab) => (
            <button
              className={`${style["tab"]} ${
                tab.id === selectedTab ? style["selected"] : ""
              }`}
              style={{
                color: `${tab.id === selectedTab ? "#f0f0f0" : "#737676"}`,
                background: `${
                  tab.id === selectedTab ? "#151A1A" : "transparent"
                }`,
                border: `${
                  tab.id === selectedTab ||
                  tabs.indexOf(tab) === 0 ||
                  tabs.indexOf(tab) === tabs.length - 1
                    ? "transparent"
                    : "white"
                }`,
                borderRadius: `${tab.id === selectedTab ? "10px" : "0px"}`,
              }}
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              disabled={tab.disabled || false}
            >
              {tab.id}
            </button>
          ))}
        </div>
      )}
      <div
        style={{
          height: tabHeight ? tabHeight : "",
          overflowY: tabHeight ? "scroll" : "inherit",
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === selectedTab ? "block" : "none",
              marginBottom: showTabsOnBottom ? "20px" : "0px",
            }}
          >
            {tab.component}
          </div>
        ))}
      </div>
      {showTabsOnBottom && (
        <div className={style["tab-bar"]}>
          {tabs.map((tab) => (
            <div key={tab.id} className={style["tab-wrapper"]}>
              <button
                className={`${style["tab"]} ${
                  tab.id === selectedTab ? style["selected"] : ""
                }`}
                style={{
                  color: `${tab.id === selectedTab ? "#000D3D" : "#FFF"}`,
                  background: `${
                    tab.id === selectedTab ? "white" : "transparent"
                  }`,
                  border: `${
                    tab.id === selectedTab ||
                    tabs.indexOf(tab) === 0 ||
                    tabs.indexOf(tab) === tabs.length - 1
                      ? "transparent"
                      : "white"
                  }`,
                  borderRadius: `${tab.id === selectedTab ? "12px" : "0px"}`,
                }}
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                disabled={tab.disabled || false}
              >
                {tab.id}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
