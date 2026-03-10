import React from "react";

function safeParseJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

/**
 * PUBLIC_INTERFACE
 * React hook: state synchronized to localStorage (JSON).
 * - Reads once on first render.
 * - Writes on updates.
 */
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = React.useState(() => {
    const raw = window.localStorage.getItem(key);
    return safeParseJson(raw, defaultValue);
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Ignore quota/write errors; app still works with in-memory state.
    }
  }, [key, value]);

  return [value, setValue];
}
