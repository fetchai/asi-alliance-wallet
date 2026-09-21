import React, {
  createContext,
  FunctionComponent,
  useContext,
  useState,
} from "react";
import { Modal } from "reactstrap";

import style from "./style.module.scss";

export interface LoadingState {
  setIsLoading(type: string, isLoading: boolean): void;
  isLoading: (type: string) => boolean;
}

const LoadingIndicatorContext = createContext<LoadingState | undefined>(
  undefined
);

export const LoadingIndicatorProvider: FunctionComponent = ({ children }) => {
  const [loadingList, setLoadingList] = useState<
    {
      type: string;
      isLoading: boolean;
    }[]
  >([]);

  const isLoading = loadingList.find((loading) => loading.isLoading) != null;

  return (
    <LoadingIndicatorContext.Provider
      value={{
        setIsLoading: (type: string, nextIsLoading: boolean) => {
          setLoadingList((current) => {
            const index = current.findIndex((loading) => loading.type === type);
            if (index >= 0) {
              if (current[index].isLoading === nextIsLoading) {
                return current;
              }
              return current.map((loading, i) =>
                i === index
                  ? { type: loading.type, isLoading: nextIsLoading }
                  : loading
              );
            }
            return current.concat({ type, isLoading: nextIsLoading });
          });
        },
        isLoading: (type: string) => {
          const loading = loadingList.find((loading) => loading.type === type);
          return loading ? loading.isLoading : false;
        },
      }}
    >
      {isLoading ? (
        <Modal
          modalClassName={style["modal"]}
          contentClassName={style["modalContentEmpty"]}
          isOpen
          centered
        >
          <i className="fa fa-spinner fa-spin fa-2x fa-fw" />
        </Modal>
      ) : null}
      {children}
    </LoadingIndicatorContext.Provider>
  );
};

export function useLoadingIndicator() {
  const state = useContext(LoadingIndicatorContext);
  if (!state)
    throw new Error("You probably forgot to use LoadingIndicatorProvider");
  return state;
}
