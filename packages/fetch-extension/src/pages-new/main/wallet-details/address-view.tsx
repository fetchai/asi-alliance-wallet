import React, { useEffect, useRef, useState } from "react";
import { debounce } from "lodash";

interface ResponsiveAddressProps {
  address: string;
  containerRef: React.RefObject<HTMLElement>;
}

export const ResponsiveAddressView: React.FC<ResponsiveAddressProps> = ({
  address,
  containerRef: externalContainerRef,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [displayText, setDisplayText] = useState(address);

  const recompute = () => {
    const container = externalContainerRef?.current || internalRef?.current;
    const measure = measureRef.current;

    if (!container || !measure) return;

    // measure full address width from hidden span
    const fullWidth = measure.scrollWidth;
    const availableWidth = (container.offsetWidth || 0) - 50;

    if (availableWidth >= fullWidth) {
      setDisplayText(address); // always reset to full address
      return;
    }

    const ratio = availableWidth / fullWidth;
    const visibleChars = Math.max(Math.floor(address.length * ratio) - 4, 6);

    const head = Math.floor(visibleChars / 2);
    const tail = Math.floor(visibleChars / 2);

    setDisplayText(`${address.slice(0, head)}...${address.slice(-tail)}`);
  };

  const debouncedRecompute = debounce(recompute, 30);

  useEffect(() => {
    const container = externalContainerRef?.current || internalRef.current;
    if (!container) return;

    // initial compute immediately
    recompute();

    const observer = new ResizeObserver(() => {
      debouncedRecompute();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [address, externalContainerRef]);

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
      {/* Hidden full address for measurement */}
      <span
        ref={measureRef}
        style={{
          opacity: 0,
          position: "absolute",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {address}
      </span>

      {/* Display truncated address */}
      <span style={{ whiteSpace: "nowrap" }}>{displayText}</span>
    </div>
  );
};
