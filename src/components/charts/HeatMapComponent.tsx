"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface HeatMapCell {
  x: string;
  y: string;
  value: number;
}

interface HeatMapComponentProps {
  data: HeatMapCell[];
  xLabels: string[];
  yLabels: string[];
  height?: number;
  colorScale?: { min: string; mid: string; max: string };
  maxValue?: number;
  showValues?: boolean;
}

export function HeatMapComponent({
  data,
  xLabels,
  yLabels,
  colorScale = { min: "#111827", mid: "#1e3a5f", max: "#3b82f6" },
  maxValue,
  showValues = false,
}: HeatMapComponentProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  function getColor(value: number) {
    const ratio = Math.min(value / max, 1);
    if (ratio < 0.01) return colorScale.min;
    if (ratio < 0.5) return colorScale.mid;
    return colorScale.max;
  }

  function getOpacity(value: number) {
    if (value === 0) return 0.1;
    return 0.2 + (value / max) * 0.8;
  }

  const cellMap = new Map<string, number>();
  data.forEach((d) => cellMap.set(`${d.y}-${d.x}`, d.value));

  return (
    <div className="w-full overflow-auto">
      <div className="inline-block min-w-full">
        {/* X-axis labels */}
        <div className="flex">
          <div className="w-16 flex-shrink-0" />
          {xLabels.map((label) => (
            <div
              key={label}
              className="flex-1 min-w-[32px] text-center text-[10px] text-gray-500 pb-1"
            >
              {label}
            </div>
          ))}
        </div>
        {/* Rows */}
        {yLabels.map((yLabel) => (
          <div key={yLabel} className="flex items-center gap-0">
            <div className="w-16 flex-shrink-0 text-right pr-2 text-[10px] text-gray-500">
              {yLabel}
            </div>
            {xLabels.map((xLabel) => {
              const value = cellMap.get(`${yLabel}-${xLabel}`) ?? 0;
              return (
                <div
                  key={`${yLabel}-${xLabel}`}
                  className={cn(
                    "flex-1 min-w-[32px] aspect-square rounded-sm m-[1px] flex items-center justify-center text-[9px] transition-colors",
                    value > 0 ? "text-white" : "text-transparent"
                  )}
                  style={{
                    backgroundColor: getColor(value),
                    opacity: getOpacity(value),
                  }}
                  title={`${yLabel} ${xLabel}: ${value}`}
                >
                  {showValues && value > 0 ? value : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
