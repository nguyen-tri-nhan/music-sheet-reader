import type { RefObject } from "react";

interface ScoreViewerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  error: string | null;
}

export function ScoreViewer({ containerRef, isLoading, error }: ScoreViewerProps) {
  return (
    <div className="score-viewer">
      {isLoading && <div className="score-viewer__status">Đang tải bản nhạc…</div>}
      {error && <div className="score-viewer__status score-viewer__status--error">{error}</div>}
      <div className="score-viewer__sheet" ref={containerRef} />
    </div>
  );
}
