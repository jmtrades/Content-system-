"use client";

import React from "react";
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AreaChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xAxisKey?: string;
  color?: string;
  gradientColor?: string;
  height?: number;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  className?: string;
}

export function AreaChart({
  data,
  dataKey,
  xAxisKey = "name",
  color = "#3b82f6",
  gradientColor,
  height = 300,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  className,
}: AreaChartProps) {
  const fillColor = gradientColor || color;
  const gradientId = `area-gradient-${dataKey}`;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fillColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
