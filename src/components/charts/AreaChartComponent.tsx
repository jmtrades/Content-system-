"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface AreaConfig {
  dataKey: string;
  color: string;
  name?: string;
  fillOpacity?: number;
}

interface AreaChartComponentProps {
  data: Record<string, unknown>[];
  areas: AreaConfig[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function AreaChartComponent({
  data,
  areas,
  xAxisKey = "name",
  height = 300,
  showGrid = true,
  showLegend = false,
}: AreaChartComponentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
        {areas.map((area) => (
          <Area
            key={area.dataKey}
            type="monotone"
            dataKey={area.dataKey}
            name={area.name || area.dataKey}
            stroke={area.color}
            fill={area.color}
            fillOpacity={area.fillOpacity ?? 0.15}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
