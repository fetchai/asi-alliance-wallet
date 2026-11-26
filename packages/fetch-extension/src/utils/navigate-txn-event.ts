import { getPathname } from "./pathname";

interface NavigateOnTxnEvents {
  redirect: () => void;
  txType: string;
  pagePathname?: string;
  txInProgress: string;
  toastNotification?: () => void;
  isEVM?: boolean;
}

export const navigateOnTxnEvents = ({
  redirect,
  txType,
  pagePathname,
  txInProgress,
  toastNotification,
  isEVM,
}: NavigateOnTxnEvents) => {
  const currentPathName = getPathname();

  const expectedPathName = pagePathname ? pagePathname : "sign";

  // redirect when on the expected pathname else show toast notification for txn if provided
  if (
    (currentPathName === expectedPathName && txInProgress === txType) ||
    (currentPathName === expectedPathName && isEVM)
  ) {
    redirect();
  } else if (toastNotification && typeof toastNotification === "function") {
    toastNotification();
  }
};
