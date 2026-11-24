import type { ModelLoadProgress } from "../game/model-cache.ts";
import "./model-loading.css";
export function ModelLoadingStatus({
  progress,
  error,
  onRetry,
}: {
  progress: ModelLoadProgress | null;
  error?: string;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="model-loading" role="alert">
        加载失败，请重试。 <button onClick={onRetry}>重新加载</button>
      </div>
    );
  if (!progress || progress.phase === "ready") return null;
  const percent =
    progress.phase === "download" && progress.total
      ? Math.min(100, Math.floor((progress.loaded * 100) / progress.total))
      : undefined;
  return (
    <div className="model-loading" role="status" aria-live="polite">
      <span>正在加载…</span>
      <progress aria-label="加载进度" max={100} value={percent} />
    </div>
  );
}
