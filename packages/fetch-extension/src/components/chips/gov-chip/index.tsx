import React, { FunctionComponent } from "react";
import style from "./style.module.scss";

const GOV_SVG_ICONS: Record<string, string> = {
  "gov-abstain-white.svg": require("@assets/svg/gov-abstain-white.svg"),
  "gov-abstain.svg": require("@assets/svg/gov-abstain.svg"),
  "gov-clock.svg": require("@assets/svg/gov-clock.svg"),
  "gov-cross-2-white.svg": require("@assets/svg/gov-cross-2-white.svg"),
  "gov-cross.svg": require("@assets/svg/gov-cross.svg"),
  "gov-no-veto-white.svg": require("@assets/svg/gov-no-veto-white.svg"),
  "gov-share-blue.svg": require("@assets/svg/gov-share-blue.svg"),
  "gov-share.svg": require("@assets/svg/gov-share.svg"),
  "gov-tick-white.svg": require("@assets/svg/gov-tick-white.svg"),
  "gov-tick.svg": require("@assets/svg/gov-tick.svg"),
};

interface Props {
  name: string;
  selectedIndex: number;
  id: number;
  handleCheck?: (id: number) => void;
  filter?: boolean;
  color?: string;
  background?: string;
  icon?: string;
}
export const GovStatusChip: FunctionComponent<Props> = (props) => {
  const {
    selectedIndex,
    name,
    id,
    filter,
    color,
    icon,
    background,
    handleCheck,
  } = props;
  return (
    <span className={style["topicChips"]}>
      <label className={style["switch"]}>
        <input
          type="checkbox"
          checked={id === selectedIndex}
          onChange={() => {
            if (handleCheck) handleCheck(id);
          }}
          id={name}
        />
        <span
          className={filter ? style["contentInverter"] : style["govStatus"]}
          style={{ backgroundColor: background, color: color }}
        >
          {icon && GOV_SVG_ICONS[icon] && (
            <img draggable={false} src={GOV_SVG_ICONS[icon]} />
          )}
          {name}
        </span>
      </label>
    </span>
  );
};
