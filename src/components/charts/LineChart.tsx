"use client";

import React from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LineChartSeries {
  dataKey: string;
  color: string;
  name?: string;
  strokeDasharray?: string;
}

interface LineChartProps {
  data: Record<string, unknown>[];
  series: LineChartSeries[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  className?: string;
}

export function LineChart({
  data,
  series,
  xAxisKey = "name",
  height = 300,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  showLegend = false,
  showDots = false,
  className,
}: LineChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          )}
          {showXAxis && (
            <XAxis
              dataKey={xAxisKey}
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
          )}
          {showYAxis && (
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
              fontSize: "12px",
            }}
            cursor={{ stroke: "#374151" }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: "#9ca3af", fontSize: "12px" }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              stroke={s.color}
              strokeWidth={2}
              name={s.name || s.dataKey}
              strokeDasharray={s.strokeDasharray}
              dot={showDots ? { fill: s.color, r: 3 } : false}
              activeDot={{ r: 5, fill: s.color }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
