import { getPathname } from "./pathname";

interface NavigateOnTxnEvents {
  redirect: () => void;
  txType: string;
  pagePathname?: string;
  txInProgress: string;
  toastNotification?: () => void;
}

export const navigateOnTxnEvents = ({
  redirect,
  txType,
  pagePathname,
  txInProgress,
  toastNotification,
}: NavigateOnTxnEvents) => {
  const currentPathName = getPathname();

  const expectedPathName = pagePathname ? pagePathname : "sign";

  // redirect when on the expected pathname else show toast notification for txn if provided
  if (currentPathName === expectedPathName && txInProgress === txType) {
    redirect();
  } else if (toastNotification && typeof toastNotification === "function") {
    toastNotification();
  }
};
