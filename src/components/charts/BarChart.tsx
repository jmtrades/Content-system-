"use client";

import React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface BarChartSeries {
  dataKey: string;
  color: string;
  name?: string;
  stackId?: string;
}

interface BarChartProps {
  data: Record<string, unknown>[];
  series: BarChartSeries[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showLegend?: boolean;
  layout?: "horizontal" | "vertical";
  className?: string;
}

export function BarChart({
  data,
  series,
  xAxisKey = "name",
  height = 300,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  showLegend = false,
  layout = "horizontal",
  className,
}: BarChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          )}
          {layout === "horizontal" ? (
            <>
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
            </>
          ) : (
            <>
              {showYAxis && (
                <YAxis
                  dataKey={xAxisKey}
                  type="category"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
              )}
              {showXAxis && (
                <XAxis
                  type="number"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
              )}
            </>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
              fontSize: "12px",
            }}
            cursor={{ fill: "rgba(107, 114, 128, 0.1)" }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: "#9ca3af", fontSize: "12px" }}
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              fill={s.color}
              name={s.name || s.dataKey}
              stackId={s.stackId}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
