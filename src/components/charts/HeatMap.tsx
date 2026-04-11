"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface HeatMapProps {
  /** 7x24 grid: data[day][hour] = intensity (0-1) */
  data: number[][];
  /** Color for the heatmap cells */
  color?: "blue" | "emerald" | "amber" | "red" | "purple";
  /** Show labels */
  showLabels?: boolean;
  className?: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i < 12) return `${i}a`;
  if (i === 12) return "12p";
  return `${i - 12}p`;
});

const colorScales: Record<string, { bg: string; range: string[] }> = {
  blue: {
    bg: "bg-blue-500",
    range: [
      "bg-gray-800/50",
      "bg-blue-500/10",
      "bg-blue-500/25",
      "bg-blue-500/40",
      "bg-blue-500/60",
      "bg-blue-500/80",
      "bg-blue-500",
    ],
  },
  emerald: {
    bg: "bg-emerald-500",
    range: [
      "bg-gray-800/50",
      "bg-emerald-500/10",
      "bg-emerald-500/25",
      "bg-emerald-500/40",
      "bg-emerald-500/60",
      "bg-emerald-500/80",
      "bg-emerald-500",
    ],
  },
  amber: {
    bg: "bg-amber-500",
    range: [
      "bg-gray-800/50",
      "bg-amber-500/10",
      "bg-amber-500/25",
      "bg-amber-500/40",
      "bg-amber-500/60",
      "bg-amber-500/80",
      "bg-amber-500",
    ],
  },
  red: {
    bg: "bg-red-500",
    range: [
      "bg-gray-800/50",
      "bg-red-500/10",
      "bg-red-500/25",
      "bg-red-500/40",
      "bg-red-500/60",
      "bg-red-500/80",
      "bg-red-500",
    ],
  },
  purple: {
    bg: "bg-purple-500",
    range: [
      "bg-gray-800/50",
      "bg-purple-500/10",
      "bg-purple-500/25",
      "bg-purple-500/40",
      "bg-purple-500/60",
      "bg-purple-500/80",
      "bg-purple-500",
    ],
  },
};

function getIntensityClass(value: number, color: string): string {
  const scale = colorScales[color] || colorScales.blue;
  const index = Math.min(
    Math.floor(value * (scale.range.length - 1)),
    scale.range.length - 1
  );
  return scale.range[Math.max(0, index)];
}

export function HeatMap({
  data,
  color = "blue",
  showLabels = true,
  className,
}: HeatMapProps) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-[640px]">
        {/* Hour labels */}
        {showLabels && (
          <div className="flex ml-10 mb-1">
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="flex-1 text-center text-[10px] text-gray-500"
              >
                {i % 3 === 0 ? hour : ""}
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="space-y-1">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1">
              {showLabels && (
                <span className="w-9 text-xs text-gray-500 text-right pr-1 flex-shrink-0">
                  {day}
                </span>
              )}
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }).map((_, hourIndex) => {
                  const value =
                    data[dayIndex]?.[hourIndex] ?? 0;
                  return (
                    <div
                      key={hourIndex}
                      className={cn(
                        "flex-1 aspect-square rounded-sm transition-colors duration-200 cursor-pointer hover:ring-1 hover:ring-white/20",
                        getIntensityClass(value, color)
                      )}
                      title={`${day} ${HOURS[hourIndex]}: ${Math.round(value * 100)}%`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-3">
          <span className="text-[10px] text-gray-500 mr-1">Less</span>
          {colorScales[color].range.map((cls, i) => (
            <div
              key={i}
              className={cn("w-3 h-3 rounded-sm", cls)}
            />
          ))}
          <span className="text-[10px] text-gray-500 ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
