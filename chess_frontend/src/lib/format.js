function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * PUBLIC_INTERFACE
 * Format milliseconds as a chess clock string (M:SS or H:MM:SS).
 */
export function formatMsAsClock(ms) {
  const safe = Math.max(0, Math.floor(ms || 0));
  const totalSeconds = Math.floor(safe / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}
