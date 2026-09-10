"use client";

import { useEffect, useState } from "react";

/** Refresh relative time labels each minute and when returning to the page. */
export function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}
