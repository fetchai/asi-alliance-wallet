import React from "react";
import { ToggleSwitchButton } from "@components-v2/buttons/toggle-switch-button";
import { toggleSidePanel } from "@utils/side-panel";

interface SidePanelProps {
  sidePanelEnabled: boolean;
  setSidePanelEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SidePanelToggle: React.FC<SidePanelProps> = ({
  sidePanelEnabled,
  setSidePanelEnabled,
}) => {
  return (
    <ToggleSwitchButton
      checked={sidePanelEnabled}
      onChange={() => toggleSidePanel(sidePanelEnabled, setSidePanelEnabled)}
    />
  );
};
