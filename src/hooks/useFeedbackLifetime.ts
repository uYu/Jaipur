import { useEffect, useRef, useState } from "react";

export const FEEDBACK_DURATION_MS = 2000;

export function useFeedbackLifetime(paused: boolean) {
  const [visible, setVisible] = useState(true);
  const remaining = useRef(FEEDBACK_DURATION_MS);
  useEffect(() => {
    if (paused || !visible) return;
    const started = Date.now();
    const timer = setTimeout(() => setVisible(false), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [paused, visible]);
  return visible;
}
