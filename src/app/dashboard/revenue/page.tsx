"use client";

import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  ArrowUp,
  Target,
  ShoppingCart,
  CreditCard,
  BarChart3,
  ExternalLink,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChartComponent } from "@/components/charts/AreaChartComponent";
import { BarChartComponent } from "@/components/charts/BarChartComponent";
import { formatCurrency, formatNumber } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const revenueCards = [
  { title: "Today", value: 847.32, change: 18.3, period: "vs yesterday" },
  { title: "This Week", value: 5234.89, change: 12.7, period: "vs last week" },
  { title: "This Month", value: 18432.54, change: 23.1, period: "vs last month" },
  { title: "All Time", value: 127843.21, change: 0, period: "since launch" },
];

const revenueTimeline = Array.from({ length: 30 }, (_, i) => ({
  day: `Apr ${i + 1}`,
  revenue: Math.round(450 + Math.random() * 800 + Math.sin(i * 0.4) * 200 + (i > 20 ? 300 : 0)),
  sales: Math.round(3 + Math.random() * 8),
}));

const products = [
  { name: "AI Content Mastery Course", price: 297, sales: 142, revenue: 42174, conversionRate: 4.2, type: "Course" },
  { name: "Prompt Engineering Templates", price: 47, sales: 834, revenue: 39198, conversionRate: 8.7, type: "Digital" },
  { name: "AI Tools Toolkit Bundle", price: 97, sales: 312, revenue: 30264, conversionRate: 5.4, type: "Digital" },
  { name: "1-on-1 AI Strategy Call", price: 497, sales: 18, revenue: 8946, conversionRate: 12.3, type: "Service" },
  { name: "Monthly AI Newsletter (Pro)", price: 9.99, sales: 420, revenue: 4195.80, conversionRate: 3.1, type: "Subscription" },
  { name: "Content Automation Blueprint", price: 197, sales: 15, revenue: 2955, conversionRate: 2.8, type: "Course" },
];

const platformROI = [
  { name: "YouTube", revenue: 48200, adSpend: 2400, roi: 1908 },
  { name: "TikTok", revenue: 36800, adSpend: 1800, roi: 1944 },
  { name: "Instagram", revenue: 22400, adSpend: 3200, roi: 600 },
  { name: "LinkedIn", revenue: 12800, adSpend: 800, roi: 1500 },
  { name: "Newsletter", revenue: 7643, adSpend: 200, roi: 3722 },
];

const funnelData = [
  { stage: "Views", value: 2340000, color: "#3b82f6" },
  { stage: "Link Clicks", value: 46800, color: "#8b5cf6" },
  { stage: "Landing Page", value: 23400, color: "#a78bfa" },
  { stage: "Add to Cart", value: 4680, color: "#f59e0b" },
  { stage: "Purchase", value: 1741, color: "#10b981" },
];

const affiliateRevenue = [
  { name: "Opus Clip", clicks: 12400, sales: 186, revenue: 5580, commission: "30%" },
  { name: "Descript", clicks: 8900, sales: 89, revenue: 2670, commission: "25%" },
  { name: "Notion AI", clicks: 7200, sales: 144, revenue: 1440, commission: "20%" },
  { name: "Riverside.fm", clicks: 5600, sales: 56, revenue: 1680, commission: "35%" },
  { name: "Beehiiv", clicks: 4300, sales: 43, revenue: 860, commission: "30%" },
  { name: "Claude Pro", clicks: 3800, sales: 76, revenue: 1520, commission: "25%" },
];

const mrrData = Array.from({ length: 12 }, (_, i) => ({
  month: ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"][i],
  mrr: Math.round(1200 + i * 340 + Math.random() * 200),
}));

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RevenuePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-28" /><Skeleton className="h-3 w-32" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    );
  }

  const totalRevenue = 127843.21;
  const revenueTarget = 100000;
  const progressToTarget = Math.min((totalRevenue / revenueTarget) * 100, 100);

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" /> Revenue Dashboard
        </h1>
        <p className="text-gray-400 text-sm mt-1">Track every pound flowing through your content empire</p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {revenueCards.map((c) => {
          return (
            <Card key={c.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-400">{c.title}</span>
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-2">{formatCurrency(c.value)}</div>
                {c.change > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <ArrowUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">{c.change}%</span>
                    <span className="text-gray-500">{c.period}</span>
                  </div>
                )}
                {c.change === 0 && (
                  <span className="text-xs text-gray-500">{c.period}</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Revenue Over Time
          </CardTitle>
          <p className="text-sm text-gray-400">Daily revenue for the last 30 days</p>
        </CardHeader>
        <CardContent>
          <AreaChartComponent
            data={revenueTimeline}
            xAxisKey="day"
            height={300}
            showLegend
            areas={[
              { dataKey: "revenue", color: "#10b981", name: "Revenue", fillOpacity: 0.15 },
            ]}
          />
        </CardContent>
      </Card>

      {/* Product Breakdown + Platform ROI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-400" />
              Product Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Conv. Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium text-white">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant={p.type === "Course" ? "info" : p.type === "Service" ? "warning" : p.type === "Subscription" ? "success" : "default"}>
                        {p.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-300">{formatCurrency(p.price)}</TableCell>
                    <TableCell className="text-gray-300">{p.sales}</TableCell>
                    <TableCell className="font-bold text-emerald-400">{formatCurrency(p.revenue)}</TableCell>
                    <TableCell className="text-gray-300">{p.conversionRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              Platform ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartComponent
              data={platformROI.map((p) => ({ name: p.name, Revenue: p.revenue / 1000 }))}
              xAxisKey="name"
              height={220}
              bars={[{ dataKey: "Revenue", color: "#8b5cf6", name: "Revenue (K)" }]}
            />
            <div className="mt-4 space-y-2">
              {platformROI.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-400">{p.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-xs">Spend: {formatCurrency(p.adSpend)}</span>
                    <span className="text-emerald-400 font-bold">{p.roi}% ROI</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel + MRR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              Conversion Funnel
            </CardTitle>
            <p className="text-sm text-gray-400">From views to purchases</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData.map((stage, idx) => {
                const maxVal = funnelData[0].value;
                const pct = (stage.value / maxVal) * 100;
                const convRate = idx > 0 ? ((stage.value / funnelData[idx - 1].value) * 100).toFixed(1) : "100";
                return (
                  <div key={stage.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-300 font-medium">{stage.stage}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-white">{formatNumber(stage.value)}</span>
                        {idx > 0 && (
                          <span className="text-xs text-gray-500">{convRate}% from above</span>
                        )}
                      </div>
                    </div>
                    <div className="h-8 bg-gray-800 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                        style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: stage.color }}
                      >
                        {pct > 15 && (
                          <span className="text-xs font-bold text-white">{pct.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MRR Tracker */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-400" />
                MRR Tracker
              </CardTitle>
              <span className="text-lg font-bold text-blue-400">{formatCurrency(mrrData[mrrData.length - 1].mrr)}/mo</span>
            </div>
            <p className="text-sm text-gray-400">Monthly recurring revenue growth</p>
          </CardHeader>
          <CardContent>
            <AreaChartComponent
              data={mrrData}
              xAxisKey="month"
              height={200}
              areas={[{ dataKey: "mrr", color: "#3b82f6", name: "MRR", fillOpacity: 0.15 }]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Target Progress + Affiliate Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-400" />
              Revenue Target
            </CardTitle>
            <p className="text-sm text-gray-400">Progress toward annual goal</p>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-white mb-1">{formatCurrency(totalRevenue)}</p>
              <p className="text-gray-400">of {formatCurrency(revenueTarget)} target</p>
            </div>
            <Progress value={progressToTarget} color="emerald" size="lg" showLabel />
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-800/50 text-center">
                <p className="text-xs text-gray-500 mb-1">Remaining</p>
                <p className="text-lg font-bold text-amber-400">
                  {totalRevenue >= revenueTarget ? "Target Hit!" : formatCurrency(revenueTarget - totalRevenue)}
                </p>
              </div>
              <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-800/50 text-center">
                <p className="text-xs text-gray-500 mb-1">Projected Date</p>
                <p className="text-lg font-bold text-blue-400">
                  {totalRevenue >= revenueTarget ? "Achieved!" : "Already Hit!"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Affiliate Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-amber-400" />
              Affiliate Revenue
            </CardTitle>
            <p className="text-sm text-gray-400">Partner program earnings</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affiliateRevenue.map((a) => (
                  <TableRow key={a.name}>
                    <TableCell>
                      <div>
                        <span className="text-white font-medium">{a.name}</span>
                        <span className="text-xs text-gray-500 ml-2">{a.commission}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-300">{formatNumber(a.clicks)}</TableCell>
                    <TableCell className="text-gray-300">{a.sales}</TableCell>
                    <TableCell className="font-bold text-emerald-400">{formatCurrency(a.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-between">
              <span className="text-sm text-gray-400">Total Affiliate Revenue</span>
              <span className="text-lg font-bold text-emerald-400">
                {formatCurrency(affiliateRevenue.reduce((sum, a) => sum + a.revenue, 0))}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
