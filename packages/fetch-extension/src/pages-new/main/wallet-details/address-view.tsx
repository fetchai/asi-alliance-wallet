import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "lodash";

interface ResponsiveAddressProps {
  address: string;
  containerRef: React.RefObject<HTMLElement>;
}

function buildMiddleEllipsis(address: string, k: number): string {
  const len = address.length;
  if (k >= len) {
    return address;
  }
  if (k <= 0) {
    return "...";
  }
  const head = Math.floor(k / 2);
  const tail = k - head;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export const ResponsiveAddressView: React.FC<ResponsiveAddressProps> = ({
  address,
  containerRef: externalContainerRef,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const fitMeasureRef = useRef<HTMLSpanElement>(null);
  const [displayText, setDisplayText] = useState(address);

  const recompute = useCallback(() => {
    const container = externalContainerRef?.current || internalRef?.current;
    const measureEl = fitMeasureRef.current;

    if (!container || !measureEl) return;

    const availableWidth = container.offsetWidth || 0;
    const measureWidth = (text: string): number => {
      measureEl.textContent = text;
      return measureEl.scrollWidth;
    };

    const len = address.length;
    if (len === 0) {
      setDisplayText("");
      return;
    }

    const fullWidth = measureWidth(address);
    if (availableWidth >= fullWidth) {
      setDisplayText(address);
      return;
    }

    let best = "...";
    let lo = 0;
    let hi = len;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = buildMiddleEllipsis(address, mid);
      const w = measureWidth(candidate);
      if (w <= availableWidth) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setDisplayText(best);
  }, [address, externalContainerRef]);

  const debouncedRecompute = useMemo(
    () => debounce(recompute, 30),
    [recompute]
  );

  useEffect(() => {
    const container = externalContainerRef?.current || internalRef.current;
    if (!container) return;

    recompute();

    const observer = new ResizeObserver(() => {
      debouncedRecompute();
    });
    observer.observe(container);

    return () => {
      debouncedRecompute.cancel();
      observer.disconnect();
    };
  }, [address, externalContainerRef, debouncedRecompute, recompute]);

  return (
    <div
      ref={internalRef}
      style={{
        display: "inline-flex",
        overflow: "hidden",
        position: "relative",
        maxWidth: "100%",
      }}
    >
      <span
        ref={fitMeasureRef}
        aria-hidden={true}
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          visibility: "hidden",
        }}
      />
      <span style={{ whiteSpace: "nowrap" }}>{displayText}</span>
    </div>
  );
};
