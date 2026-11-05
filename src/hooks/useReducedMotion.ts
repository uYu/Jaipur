import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const getSnapshot = () => window.matchMedia(query).matches;
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  // Older iOS Safari exposes only the legacy MediaQueryList listener API.
  if (!media.addEventListener) {
    media.addListener(notify);
    return () => media.removeListener(notify);
  }
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
