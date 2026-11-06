import { useSyncExternalStore } from "react";

const query = "(max-width: 860px)";
const getSnapshot = () => window.matchMedia(query).matches;
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  if (!media.addEventListener) {
    media.addListener(notify);
    return () => media.removeListener(notify);
  }
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

export const useMobileLayout = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
