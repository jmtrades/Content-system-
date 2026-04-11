"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  ArrowUp,
  Eye,
  Users,
  Clock,
  Target,
  Activity,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { PieChartComponent } from "@/components/charts/PieChartComponent";
import { HeatMapComponent } from "@/components/charts/HeatMapComponent";
import { formatNumber } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const platforms = ["All", "TikTok", "Instagram", "YouTube", "LinkedIn"];
const dateRanges = ["7d", "30d", "90d"];

const mockEngagementData = Array.from({ length: 30 }, (_, i) => ({
  day: `Apr ${i + 1}`,
  views: Math.round(12000 + Math.random() * 45000 + Math.sin(i * 0.3) * 15000),
  engagement: Math.round(800 + Math.random() * 3200 + Math.sin(i * 0.5) * 1000),
  likes: Math.round(600 + Math.random() * 2400 + Math.sin(i * 0.4) * 800),
}));

const mockHookPerformance = [
  { hook: "I just discovered something that changes everything...", retention: 94, views: 892000, platform: "TikTok" },
  { hook: "Stop doing this if you want to grow on social media...", retention: 91, views: 654000, platform: "Instagram" },
  { hook: "Nobody is talking about this AI tool and it's insane...", retention: 89, views: 523000, platform: "TikTok" },
  { hook: "I went from 0 to 50K followers in 90 days. Here's how...", retention: 87, views: 412000, platform: "YouTube" },
  { hook: "This free tool just replaced my entire marketing stack...", retention: 85, views: 387000, platform: "TikTok" },
  { hook: "The truth that AI gurus don't want you to know...", retention: 83, views: 298000, platform: "YouTube" },
  { hook: "I made $3,000 in one week using this AI strategy...", retention: 82, views: 267000, platform: "Instagram" },
  { hook: "Why most people fail at AI content creation...", retention: 80, views: 234000, platform: "LinkedIn" },
  { hook: "Watch me build a $100K business from scratch with AI...", retention: 78, views: 198000, platform: "YouTube" },
  { hook: "The AI tool that 99% of creators are sleeping on...", retention: 76, views: 176000, platform: "TikTok" },
];

const mockPillarBreakdown = [
  { name: "AI News", value: 32, color: "#f87171" },
  { name: "Tutorials", value: 25, color: "#a78bfa" },
  { name: "Tools Review", value: 18, color: "#60a5fa" },
  { name: "Business", value: 15, color: "#34d399" },
  { name: "Opinion", value: 10, color: "#fbbf24" },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = ["6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"];

const mockPostingHeatmapData = days.flatMap((day) =>
  hours.map((hour) => {
    let baseValue = 0;
    if (["9am", "10am", "11am", "12pm"].includes(hour)) baseValue += 6;
    if (["2pm", "3pm", "4pm"].includes(hour)) baseValue += 5;
    if (["6pm", "7pm", "8pm"].includes(hour)) baseValue += 8;
    if (["Tue", "Wed", "Thu"].includes(day)) baseValue += 3;
    return { x: hour, y: day, value: Math.max(0, baseValue + Math.floor(Math.random() * 4) - 1) };
  })
);

const mockPlatformComparison = [
  { name: "TikTok", views: 2340000, engagement: 7.8, followers: 52300, posts: 18 },
  { name: "Instagram", views: 890000, engagement: 5.2, followers: 34200, posts: 12 },
  { name: "YouTube", views: 567000, engagement: 8.4, followers: 22100, posts: 4 },
  { name: "LinkedIn", views: 234000, engagement: 6.1, followers: 19243, posts: 8 },
];

const mockAudienceGrowth = [
  { platform: "TikTok", current: 52300, daily: 420, weekly: 2940, monthly: 12600, trend: "up" as const },
  { platform: "Instagram", current: 34200, daily: 180, weekly: 1260, monthly: 5400, trend: "up" as const },
  { platform: "YouTube", current: 22100, daily: 95, weekly: 665, monthly: 2850, trend: "up" as const },
  { platform: "LinkedIn", current: 19243, daily: 65, weekly: 455, monthly: 1950, trend: "up" as const },
  { platform: "Newsletter", current: 8420, daily: 32, weekly: 224, monthly: 960, trend: "up" as const },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");
  const [platform, setPlatform] = useState("All");
  const [engagementData, setEngagementData] = useState(mockEngagementData);
  const [hookPerformance, setHookPerformance] = useState(mockHookPerformance);
  const [pillarBreakdown, setPillarBreakdown] = useState(mockPillarBreakdown);
  const [postingHeatmapData, setPostingHeatmapData] = useState(mockPostingHeatmapData);
  const [platformComparison, setPlatformComparison] = useState(mockPlatformComparison);
  const [audienceGrowth, setAudienceGrowth] = useState(mockAudienceGrowth);
  const [optimizations, setOptimizations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [reportRes, optimizeRes] = await Promise.allSettled([
          fetch('/api/analytics/report?period=weekly'),
          fetch('/api/analytics/optimize'),
        ]);

        if (reportRes.status === 'fulfilled' && reportRes.value.ok) {
          const json = await reportRes.value.json();
          if (json.success && json.data) {
            const d = json.data;
            if (d.engagementData) setEngagementData(d.engagementData);
            if (d.hookPerformance) setHookPerformance(d.hookPerformance);
            if (d.pillarBreakdown) setPillarBreakdown(d.pillarBreakdown);
            if (d.postingHeatmap) setPostingHeatmapData(d.postingHeatmap);
            if (d.platformComparison) setPlatformComparison(d.platformComparison);
            if (d.audienceGrowth) setAudienceGrowth(d.audienceGrowth);
          }
        }

        if (optimizeRes.status === 'fulfilled' && optimizeRes.value.ok) {
          const json = await optimizeRes.value.json();
          if (json.success && json.data) {
            setOptimizations(json.data.recommendations || json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch analytics data:', err);
        setError('Some analytics data could not be loaded. Showing cached data.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const platformBarData = platformComparison.map((p) => ({
    name: p.name,
    Views: p.views / 1000,
    Engagement: p.engagement * 1000,
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2"><Skeleton className="h-10 w-20" /><Skeleton className="h-10 w-20" /><Skeleton className="h-10 w-20" /></div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-amber-400">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-300 text-sm">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" /> Analytics Dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">Deep dive into your content performance metrics</p>
        </div>
      </div>

      {/* Optimization Recommendations */}
      {optimizations.length > 0 && (
        <Card className="border-blue-500/30">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-blue-400 mb-2">Optimization Recommendations</p>
            <ul className="space-y-1">
              {optimizations.map((rec, i) => (
                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">-</span> {typeof rec === 'string' ? rec : JSON.stringify(rec)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1 border border-gray-800">
          {dateRanges.map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                dateRange === r ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Platform Tabs */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1 border border-gray-800">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                platform === p ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Engagement Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            Engagement Overview
          </CardTitle>
          <p className="text-sm text-gray-400">Views and engagement over the last {dateRange}</p>
        </CardHeader>
        <CardContent>
          <AreaChartComponent
            data={engagementData}
            xAxisKey="day"
            height={300}
            showLegend
            areas={[
              { dataKey: "views", color: "#3b82f6", name: "Views", fillOpacity: 0.1 },
              { dataKey: "engagement", color: "#10b981", name: "Engagement", fillOpacity: 0.15 },
              { dataKey: "likes", color: "#f472b6", name: "Likes", fillOpacity: 0.1 },
            ]}
          />
        </CardContent>
      </Card>

      {/* Row 2: Hook Performance + Content Pillar Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-400" />
              Hook Performance
            </CardTitle>
            <p className="text-sm text-gray-400">Top 10 hooks by audience retention</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {hookPerformance.map((h, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-800/50">
                  <span className="text-lg font-bold text-gray-600 w-6 flex-shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 leading-snug">{h.hook}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-emerald-400 font-bold">{h.retention}% retention</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Eye className="h-3 w-3" />{formatNumber(h.views)}
                      </span>
                      <Badge variant={h.platform === "TikTok" ? "danger" : h.platform === "YouTube" ? "danger" : h.platform === "Instagram" ? "info" : "info"} className="text-[10px]">
                        {h.platform}
                      </Badge>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${h.retention}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              Content Pillar Breakdown
            </CardTitle>
            <p className="text-sm text-gray-400">Post distribution by content category</p>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={pillarBreakdown} height={280} innerRadius={70} outerRadius={110} />
            <div className="mt-4 space-y-2">
              {pillarBreakdown.map((p) => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-sm text-gray-300">{p.name}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-300">{p.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Posting Time Heatmap + Platform Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" />
              Best Posting Times
            </CardTitle>
            <p className="text-sm text-gray-400">Engagement intensity by day and hour</p>
          </CardHeader>
          <CardContent>
            <HeatMapComponent
              data={postingHeatmapData}
              xLabels={hours}
              yLabels={days}
              showValues={false}
            />
            <div className="flex items-center justify-between mt-4 px-16">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-800/50" />
                <span className="text-xs text-gray-500">Low</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500/40" />
                <span className="text-xs text-gray-500">Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500" />
                <span className="text-xs text-gray-500">High</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Platform Comparison
            </CardTitle>
            <p className="text-sm text-gray-400">Views (K) by platform</p>
          </CardHeader>
          <CardContent>
            <BarChartComponent
              data={platformBarData}
              xAxisKey="name"
              height={300}
              bars={[
                { dataKey: "Views", color: "#3b82f6", name: "Views (K)" },
              ]}
            />
            <div className="grid grid-cols-2 gap-4 mt-4">
              {platformComparison.map((p) => (
                <div key={p.name} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-800/50">
                  <div>
                    <p className="text-xs text-gray-500">{p.name}</p>
                    <p className="text-sm font-bold text-white">{p.engagement}% eng</p>
                  </div>
                  <p className="text-sm text-gray-400">{p.posts} posts</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Audience Growth Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            Audience Growth
          </CardTitle>
          <p className="text-sm text-gray-400">Follower changes across all channels</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Daily</TableHead>
                <TableHead>Weekly</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audienceGrowth.map((a) => (
                <TableRow key={a.platform}>
                  <TableCell className="font-medium text-white">{a.platform}</TableCell>
                  <TableCell className="font-bold text-white">{formatNumber(a.current)}</TableCell>
                  <TableCell>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ArrowUp className="h-3 w-3" />+{a.daily}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ArrowUp className="h-3 w-3" />+{formatNumber(a.weekly)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ArrowUp className="h-3 w-3" />+{formatNumber(a.monthly)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="w-16 h-6">
                      <svg viewBox="0 0 64 24" fill="none" className="w-full h-full">
                        <path d="M0 20 L10 16 L20 18 L30 12 L40 14 L50 8 L64 4" stroke="#10b981" strokeWidth="2" fill="none" />
                      </svg>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
