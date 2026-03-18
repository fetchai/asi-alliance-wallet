import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useContext,
  useRef,
} from "react";

import { AnimatePresence, motion } from "framer-motion";

import style from "./menu.module.scss";

export interface MenuContext {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const menuContext = React.createContext<MenuContext | null>(null);

export const MenuProvider = menuContext.Provider;

export const useMenu = (): MenuContext => {
  const context = useContext(menuContext);
  if (!context) {
    throw new Error("You have forgot to use MenuProvider");
  }
  return context;
};

const sidebar = {
  open: {
    x: 0,
    transition: {
      type: "tween",
      ease: "easeOut",
      duration: 0.3,
    },
  },
  closed: {
    x: "-100%",
    transition: {
      type: "tween",
      ease: "easeOut",
      duration: 0.15,
    },
  },
};

const background = {
  open: {
    opacity: 0.3,
    transition: {
      type: "tween",
      ease: "easeOut",
      duration: 0.3,
    },
  },
  closed: {
    opacity: 0,
    transition: {
      type: "tween",
      ease: "easeOut",
      duration: 0.15,
    },
  },
};

export interface Props extends PropsWithChildren {
  isOpen: boolean;
}

export const Menu: FunctionComponent<Props> = ({ isOpen, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const menu = useMenu();

  const menuOnClick = useCallback(() => {
    menu.close();
  }, [menu]);

  return (
    <React.Fragment>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="menu-backdrop"
            className={style["background"]}
            variants={background}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={menuOnClick}
          />
        ) : null}
      </AnimatePresence>

      <motion.nav
        className={style["menuNav"]}
        ref={containerRef}
        variants={sidebar}
        initial="closed"
        animate={isOpen ? "open" : "closed"}
      >
        {children}
      </motion.nav>
    </React.Fragment>
  );
};
