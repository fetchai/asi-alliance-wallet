import React, { useEffect } from "react";
import style from "./style.module.scss";
import { useDropdown } from "./dropdown-context";

export interface DropdownProps {
  isOpen?: boolean;
  title: string;
  setIsOpen?: any;
  closeClicked: any;
  styleProp?: any;
  showCloseIcon?: boolean;
  showTopNav?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
  children,
  title,
  setIsOpen,
  isOpen = false,
  closeClicked,
  styleProp,
  showCloseIcon = true,
  showTopNav,
}) => {
  const { setIsDropdownOpen } = useDropdown();

  useEffect(() => {
    setIsDropdownOpen(isOpen);
  }, [isOpen]);

  return isOpen ? (
    <React.Fragment>
      <div
        style={showTopNav ? { top: "62px" } : {}}
        className={style["overlay"]}
        onClick={closeClicked}
      />
      <div style={styleProp} className={style["dropdownContainer"]}>
        <div className={style["header"]}>
          {title}
          {showCloseIcon && (
            <div className={style["closeIconContainer"]}>
              <img
                className={style["closeIcon"]}
                onClick={() => {
                  closeClicked();
                  setIsOpen(false);
                }}
                src={require("@assets/svg/wireframe/xmark.svg")}
              />
            </div>
          )}
        </div>
        {children}
      </div>
    </React.Fragment>
  ) : null;
};
