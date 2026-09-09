import React, {
  Component,
  ErrorInfo,
  FunctionComponent,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { Button } from "reactstrap";

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  {
    // noop
  },
  State
> {
  public override state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return <ErrorBoundaryView />;
    }

    return this.props.children;
  }
}

// Reset is intentionally limited to these four prefixes to avoid wiping
// user-critical data (selected chain, UI config, prices, etc.). If update
// conflicts persist after an extension upgrade, consider adding more
// prefixes (weigh loss of user settings).
const CACHE_KEY_PREFIXES = [
  "store_queries/",
  "store_activity_config/",
  "store_token_graph_config/",
  "store_account_config/",
];

const ErrorBoundaryView: FunctionComponent = observer(() => {
  const [isLoading, setIsLoading] = useState(false);

  const resetCacheData = async () => {
    const storageList = await browser.storage.local.get();
    const keysToRemove = Object.keys(storageList).filter((key) =>
      CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
    await browser.storage.local.remove(keysToRemove);
  };

  return (
    <div>
      <span>
        {" "}
        An error with an unknown reason has occurred. To potentially resolve the
        issue, we recommend deleting the cache data. However, please note that
        we cannot guarantee this will fix the problem.
      </span>
      <Button
        text="Reset Cache Data"
        color="primary"
        size="medium"
        style={{ width: "100%" }}
        onClick={async () => {
          if (isLoading) {
            return;
          }

          setIsLoading(true);

          try {
            await resetCacheData();
            window.location.reload();
          } catch (e) {
            setIsLoading(false);
          }
        }}
      >
        Reset Cache Data
      </Button>
    </div>
  );
});
