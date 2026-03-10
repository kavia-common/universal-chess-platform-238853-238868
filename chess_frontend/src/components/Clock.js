import React from "react";
import { formatMsAsClock } from "../lib/format";

/**
 * PUBLIC_INTERFACE
 * Clock component showing remaining time.
 */
export default function Clock({ label, ms, active }) {
  return (
    <div className={`clockCard ${active ? "clockCardActive" : ""}`} aria-label={`${label} clock`}>
      <div className="clockLabel">{label}</div>
      <div className="clockValue" aria-live="polite">
        {formatMsAsClock(ms)}
      </div>
    </div>
  );
}
