import { useEffect, useState } from "react";

/**
 * Browser online status via navigator.onLine and online/offline events (Lace-style, no background deps).
 * Used to show "connection lost" vs "wallet syncing" in Cardano flows.
 */
export function useNetwork(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(
    typeof window !== "undefined" ? window.navigator.onLine : true
  );

  useEffect(() => {
    const update = () => setIsOnline(window.navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return { isOnline };
}
