"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  DollarSign,
  FileText,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Clock,
  Zap,
  Target,
  Activity,
  Eye,
  Bell,
  ChevronRight,
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChartComponent } from "@/components/charts/LineChartComponent";
import { AreaChartComponent } from "@/components/charts/AreaChartComponent";
import { formatNumber, formatCurrency } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const mockStatCards = [
  { title: "Total Followers", value: 127843, change: 12.4, icon: Users, format: "number" as const },
  { title: "Revenue This Month", value: 8432.5, change: 23.1, icon: DollarSign, format: "currency" as const },
  { title: "Posts Published", value: 47, change: -3.2, icon: FileText, format: "raw" as const },
  { title: "Avg Engagement Rate", value: 6.8, change: 1.9, icon: TrendingUp, format: "percent" as const },
];

const mockGrowthData = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  TikTok: Math.round(45200 + i * 420 + Math.sin(i * 0.5) * 600),
  Instagram: Math.round(32100 + i * 310 + Math.sin(i * 0.4) * 400),
  YouTube: Math.round(18700 + i * 180 + Math.sin(i * 0.3) * 300),
  LinkedIn: Math.round(9400 + i * 95 + Math.sin(i * 0.6) * 200),
}));

const mockScheduledPosts = [
  { id: 1, title: "Why GPT-5 Changes Everything for Creators", platform: "TikTok", time: "Today 2:00 PM", status: "ready" },
  { id: 2, title: "5 AI Tools That Replaced My Entire Team", platform: "Instagram", time: "Today 5:30 PM", status: "ready" },
  { id: 3, title: "The $0 to $10K AI Business Blueprint", platform: "YouTube", time: "Tomorrow 10:00 AM", status: "rendering" },
  { id: 4, title: "Unpopular Opinion: AI Won't Take Your Job", platform: "LinkedIn", time: "Tomorrow 12:00 PM", status: "ready" },
  { id: 5, title: "I Built an App in 10 Minutes with Claude", platform: "TikTok", time: "Tomorrow 3:00 PM", status: "draft" },
  { id: 6, title: "Stop Using ChatGPT Like This", platform: "Instagram", time: "Apr 13 9:00 AM", status: "ready" },
  { id: 7, title: "The AI Newsletter That Makes Me $3K/mo", platform: "YouTube", time: "Apr 13 2:00 PM", status: "editing" },
  { id: 8, title: "Reaction: Sam Altman's Latest Interview", platform: "TikTok", time: "Apr 14 11:00 AM", status: "draft" },
  { id: 9, title: "How to Automate Content with AI Agents", platform: "LinkedIn", time: "Apr 14 4:00 PM", status: "ready" },
  { id: 10, title: "AI-Powered Editing Workflow Tutorial", platform: "YouTube", time: "Apr 15 10:00 AM", status: "draft" },
];

const topPosts = [
  { id: 1, title: "I Replaced My Marketing Team with AI Agents", platform: "TikTok", views: 892000, engagement: 8.4 },
  { id: 2, title: "The Truth About AI Side Hustles in 2026", platform: "YouTube", views: 345000, engagement: 7.2 },
  { id: 3, title: "Day in the Life of an AI Content Creator", platform: "Instagram", views: 234000, engagement: 9.1 },
  { id: 4, title: "Why 90% of AI Startups Will Fail", platform: "LinkedIn", views: 187000, engagement: 6.8 },
  { id: 5, title: "Building $1M Business with Just AI Tools", platform: "TikTok", views: 156000, engagement: 7.9 },
];

const mockAlerts = [
  { id: 1, type: "milestone", message: "TikTok crossed 50K followers!", time: "2h ago", priority: "high" },
  { id: 2, type: "breaking", message: "OpenAI announces GPT-5 release date — create content NOW", time: "3h ago", priority: "critical" },
  { id: 3, type: "performance", message: "AI Agents video trending #4 on TikTok", time: "5h ago", priority: "high" },
  { id: 4, type: "revenue", message: "New course sale: AI Content Mastery ($297)", time: "6h ago", priority: "medium" },
  { id: 5, type: "competitor", message: "Matt Wolfe posted about same topic — differentiate angle", time: "8h ago", priority: "medium" },
  { id: 6, type: "milestone", message: "Reached 1,000 email subscribers this week", time: "12h ago", priority: "medium" },
];

const mockMilestones = [
  { platform: "TikTok", current: 52300, goal: 100000, projected: "Jul 2026" },
  { platform: "Instagram", current: 34200, goal: 50000, projected: "Sep 2026" },
  { platform: "YouTube", current: 22100, goal: 50000, projected: "Dec 2026" },
  { platform: "LinkedIn", current: 19243, goal: 50000, projected: "Mar 2027" },
];

const mockRevenueWeek = [
  { day: "Mon", revenue: 892 },
  { day: "Tue", revenue: 1234 },
  { day: "Wed", revenue: 756 },
  { day: "Thu", revenue: 1567 },
  { day: "Fri", revenue: 2103 },
  { day: "Sat", revenue: 1845 },
  { day: "Sun", revenue: 1432 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const platformBadgeVariant: Record<string, "danger" | "info" | "warning" | "success"> = {
  TikTok: "danger",
  Instagram: "info",
  YouTube: "danger",
  LinkedIn: "info",
};
const platformColor: Record<string, string> = {
  TikTok: "text-pink-400",
  Instagram: "text-purple-400",
  YouTube: "text-red-400",
  LinkedIn: "text-blue-400",
};
const statusVariant: Record<string, "success" | "warning" | "info" | "default"> = {
  ready: "success",
  rendering: "warning",
  editing: "info",
  draft: "default",
};
const alertColor: Record<string, string> = {
  milestone: "text-emerald-400",
  breaking: "text-red-400",
  performance: "text-blue-400",
  revenue: "text-amber-400",
  competitor: "text-purple-400",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OverviewDashboard() {
  const [loading, setLoading] = useState(true);
  const [statCards, setStatCards] = useState(mockStatCards);
  const [scheduledPosts, setScheduledPosts] = useState(mockScheduledPosts);
  const [revenueWeek, setRevenueWeek] = useState(mockRevenueWeek);
  const [alerts] = useState(mockAlerts);
  const [milestones] = useState(mockMilestones);
  const [growthData] = useState(mockGrowthData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [analyticsRes, queueRes, revenueRes] = await Promise.allSettled([
          fetch('/api/analytics/report?period=daily'),
          fetch('/api/distributor/queue?status=scheduled&limit=10'),
          fetch('/api/revenue/dashboard'),
        ]);

        if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
          const json = await analyticsRes.value.json();
          if (json.success && json.data) {
            // Map analytics data to stat cards if available
            const d = json.data;
            if (d.stats || d.metrics) {
              const stats = d.stats || d.metrics;
              setStatCards((prev) => prev.map((card) => {
                if (card.title === "Total Followers" && stats.totalFollowers != null) return { ...card, value: stats.totalFollowers, change: stats.followerChange ?? card.change };
                if (card.title === "Revenue This Month" && stats.revenue != null) return { ...card, value: stats.revenue, change: stats.revenueChange ?? card.change };
                if (card.title === "Posts Published" && stats.postsPublished != null) return { ...card, value: stats.postsPublished, change: stats.postsChange ?? card.change };
                if (card.title === "Avg Engagement Rate" && stats.engagementRate != null) return { ...card, value: stats.engagementRate, change: stats.engagementChange ?? card.change };
                return card;
              }));
            }
          }
        }

        if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
          const json = await queueRes.value.json();
          if (json.success && json.data) {
            setScheduledPosts(json.data);
          }
        }

        if (revenueRes.status === 'fulfilled' && revenueRes.value.ok) {
          const json = await revenueRes.value.json();
          if (json.success && json.data) {
            if (json.data.revenueWeek || json.data.weeklyRevenue) {
              setRevenueWeek(json.data.revenueWeek || json.data.weeklyRevenue);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Some data could not be loaded. Showing cached data.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-32" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2"><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
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
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time overview of your content empire</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="gap-1"><Activity className="h-3 w-3" /> All Systems Operational</Badge>
          <span className="text-xs text-gray-500">Updated just now</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          const up = s.change >= 0;
          const val =
            s.format === "currency" ? formatCurrency(s.value) :
            s.format === "number" ? formatNumber(s.value) :
            s.format === "percent" ? `${s.value}%` : String(s.value);
          return (
            <Card key={s.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-400">{s.title}</span>
                  <div className="p-2 rounded-lg bg-gray-800"><Icon className="h-4 w-4 text-blue-400" /></div>
                </div>
                <div className="text-3xl font-bold text-white mb-2">{val}</div>
                <div className="flex items-center gap-1 text-sm">
                  {up ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-red-400" />}
                  <span className={up ? "text-emerald-400" : "text-red-400"}>{Math.abs(s.change)}%</span>
                  <span className="text-gray-500">vs last month</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Growth Chart + Live Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-400" />Growth Velocity</CardTitle>
            <p className="text-sm text-gray-400">Follower growth across platforms — last 30 days</p>
          </CardHeader>
          <CardContent>
            <LineChartComponent
              data={growthData}
              xAxisKey="day"
              height={280}
              showLegend
              lines={[
                { dataKey: "TikTok", color: "#f472b6", name: "TikTok" },
                { dataKey: "Instagram", color: "#a78bfa", name: "Instagram" },
                { dataKey: "YouTube", color: "#f87171", name: "YouTube" },
                { dataKey: "LinkedIn", color: "#60a5fa", name: "LinkedIn" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-400" />Live Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-800">
                  <Zap className={`h-4 w-4 mt-0.5 flex-shrink-0 ${alertColor[a.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 leading-snug">{a.message}</p>
                    <span className="text-xs text-gray-500 mt-1 block">{a.time}</span>
                  </div>
                  {a.priority === "critical" && <Badge variant="danger">Urgent</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Queue + Top Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-blue-400" />Content Queue</CardTitle>
              <Badge variant="info">{scheduledPosts.length} scheduled</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledPosts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-white max-w-[280px] truncate">{p.title}</TableCell>
                    <TableCell><Badge variant={platformBadgeVariant[p.platform]}>{p.platform}</Badge></TableCell>
                    <TableCell className="text-gray-400 text-sm whitespace-nowrap">{p.time}</TableCell>
                    <TableCell><Badge variant={statusVariant[p.status]}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-emerald-400" />Top Posts This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topPosts.map((p, idx) => (
                <div key={p.id} className="flex items-start gap-3 group cursor-pointer">
                  <span className="text-lg font-bold text-gray-600 w-6">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-snug group-hover:text-blue-400 transition-colors truncate">{p.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant={platformBadgeVariant[p.platform]} className="text-[10px]">{p.platform}</Badge>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(p.views)}</span>
                      <span className="text-xs text-emerald-400">{p.engagement}% eng</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 mt-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Milestones + Revenue Mini */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-purple-400" />Projected Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {milestones.map((m) => {
                const pct = (m.current / m.goal) * 100;
                return (
                  <div key={m.platform}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${platformColor[m.platform]}`}>{m.platform}</span>
                        <span className="text-xs text-gray-500">{formatNumber(m.current)} / {formatNumber(m.goal)}</span>
                      </div>
                      <span className="text-xs text-gray-400">Est. {m.projected}</span>
                    </div>
                    <Progress value={pct} color="blue" size="sm" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400" />Revenue (Last 7 Days)</CardTitle>
              <span className="text-lg font-bold text-emerald-400">{formatCurrency(revenueWeek.reduce((a, b) => a + b.revenue, 0))}</span>
            </div>
          </CardHeader>
          <CardContent>
            <AreaChartComponent
              data={revenueWeek}
              xAxisKey="day"
              height={200}
              areas={[{ dataKey: "revenue", color: "#10b981", name: "Revenue", fillOpacity: 0.2 }]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
