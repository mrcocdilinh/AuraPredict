import type { PointerEvent as ReactPointerEvent } from "react";
import { Outcome } from "../types";

type ChartPoint = {
  x: number;
  timestamp: number;
  yesPercent: number;
  noPercent: number;
};

type ChartTick = { x: number; label: string };
type YTick = { y: number; label: string };

type Props = {
  yesPath: string;
  noPath: string;
  selectedSide: Outcome;
  lastPoint?: ChartPoint;
  focusPoint?: ChartPoint;
  pointerActive: boolean;
  focusYesY: number;
  focusNoY: number;
  tooltipLeft: number;
  tooltipSide: string;
  yTicks: YTick[];
  timeTicks: ChartTick[];
  timeLabel: (timestamp: number) => string;
  onHoverRatio: (ratio: number | null) => void;
};

export function InteractiveOddsChart({
  yesPath,
  noPath,
  selectedSide,
  lastPoint,
  focusPoint,
  pointerActive,
  focusYesY,
  focusNoY,
  tooltipLeft,
  tooltipSide,
  yTicks,
  timeTicks,
  timeLabel,
  onHoverRatio
}: Props) {
  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onHoverRatio(Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))));
  };

  return (
    <>
      <div
        className="chart-frame"
        onPointerLeave={() => onHoverRatio(null)}
        onPointerEnter={updatePointer}
        onPointerMove={updatePointer}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updatePointer(event);
        }}
      >
        <svg className="detail-chart" viewBox="0 0 100 58" preserveAspectRatio="none" role="img" aria-label="Market odds chart">
          <path className="edge-grid" d="M8 8H92 M8 19.5H92 M8 31H92 M8 42.5H92 M8 54H92" />
          <path className={`detail-yes-line ${selectedSide === Outcome.Yes ? "is-focused" : "is-muted"}`} d={yesPath} />
          <path className={`detail-no-line ${selectedSide === Outcome.No ? "is-focused" : "is-muted"}`} d={noPath} />
          {lastPoint && (
            <>
              <circle className="chart-end-dot yes" cx={lastPoint.x} cy={54 - lastPoint.yesPercent * 0.46} r="1.2" />
              <circle className="chart-end-dot no" cx={lastPoint.x} cy={54 - lastPoint.noPercent * 0.46} r="1.2" />
            </>
          )}
        </svg>
        {focusPoint && (
          <>
            <span className={`chart-crosshair ${pointerActive ? "is-active" : "is-idle"}`} style={{ left: `${focusPoint.x}%` }} />
            <span className={`chart-hover-dot yes ${pointerActive ? "is-active" : "is-idle"}`} style={{ left: `${focusPoint.x}%`, top: `${(focusYesY / 58) * 100}%` }} />
            <span className={`chart-hover-dot no ${pointerActive ? "is-active" : "is-idle"}`} style={{ left: `${focusPoint.x}%`, top: `${(focusNoY / 58) * 100}%` }} />
            {pointerActive && (
              <div className={`chart-tooltip chart-unified-tooltip is-${tooltipSide}`} style={{ left: `${tooltipLeft}%` }}>
                <span className="chart-unified-time">{timeLabel(focusPoint.timestamp)}</span>
                <div className="chart-unified-row">
                  <span className="chart-unified-dot yes" />
                  <span className="chart-unified-label">YES</span>
                  <strong className="tooltip-yes">{focusPoint.yesPercent.toFixed(1)}%</strong>
                </div>
                <div className="chart-unified-row">
                  <span className="chart-unified-dot no" />
                  <span className="chart-unified-label">NO</span>
                  <strong className="tooltip-no">{focusPoint.noPercent.toFixed(1)}%</strong>
                </div>
              </div>
            )}
          </>
        )}
        <div className="chart-y-labels" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={`${tick.y}-${tick.label}`} style={{ top: `${(tick.y / 58) * 100}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-time-row">
        {timeTicks.map((tick, index) => (
          <span
            className={index === 0 ? "is-first" : index === timeTicks.length - 1 ? "is-last" : ""}
            key={`${tick.x}-${tick.label}`}
            style={{ left: `${tick.x}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </>
  );
}
