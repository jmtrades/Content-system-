"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface BarConfig {
  dataKey: string;
  color: string;
  name?: string;
  radius?: number;
}

interface BarChartComponentProps {
  data: Record<string, unknown>[];
  bars: BarConfig[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  layout?: "horizontal" | "vertical";
}

export function BarChartComponent({
  data,
  bars,
  xAxisKey = "name",
  height = 300,
  showGrid = true,
  showLegend = false,
  layout = "horizontal",
}: BarChartComponentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout === "vertical" ? "vertical" : "horizontal"}
        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
      >
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        )}
        {layout === "vertical" ? (
          <>
            <XAxis type="number" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey={xAxisKey}
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={80}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xAxisKey}
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#f3f4f6",
            fontSize: "12px",
          }}
        />
        {showLegend && <Legend />}
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name || bar.dataKey}
            fill={bar.color}
            radius={bar.radius ?? 4}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
