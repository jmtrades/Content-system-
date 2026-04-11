"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LineConfig {
  dataKey: string;
  color: string;
  name?: string;
  strokeDasharray?: string;
  strokeWidth?: number;
}

interface LineChartComponentProps {
  data: Record<string, unknown>[];
  lines: LineConfig[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function LineChartComponent({
  data,
  lines,
  xAxisKey = "name",
  height = 300,
  showGrid = true,
  showLegend = false,
}: LineChartComponentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        )}
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
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name || line.dataKey}
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? 2}
            strokeDasharray={line.strokeDasharray}
            dot={false}
            activeDot={{ r: 4, fill: line.color }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
