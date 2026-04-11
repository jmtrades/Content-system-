"use client";

import React, { useState, useEffect } from "react";
import {
  Eye,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Users,
  Globe,
  Target,
  Filter,
  Search,
  ExternalLink,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChartComponent } from "@/components/charts/LineChartComponent";
import { HeatMapComponent } from "@/components/charts/HeatMapComponent";
import { formatNumber } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface Competitor {
  id: number;
  name: string;
  handle: string;
  avatar: string;
  platforms: string[];
  followers: number;
  growthRate: number;
  avgEngagement: number;
  postsPerWeek: number;
  topTopic: string;
}

const competitors: Competitor[] = [
  { id: 1, name: "Matt Wolfe", handle: "@maboroshi", avatar: "MW", platforms: ["YouTube", "TikTok", "Twitter"], followers: 892000, growthRate: 8.2, avgEngagement: 5.4, postsPerWeek: 12, topTopic: "AI Tools Reviews" },
  { id: 2, name: "AI Jason", handle: "@ai_jason_", avatar: "AJ", platforms: ["YouTube", "Twitter"], followers: 654000, growthRate: 12.1, avgEngagement: 7.8, postsPerWeek: 8, topTopic: "AI Tutorials" },
  { id: 3, name: "The AI Advantage", handle: "@aiadvantage", avatar: "AA", platforms: ["YouTube", "TikTok", "Instagram"], followers: 523000, growthRate: 6.4, avgEngagement: 4.9, postsPerWeek: 15, topTopic: "AI Productivity" },
  { id: 4, name: "Riley Brown", handle: "@rileybrown_ai", avatar: "RB", platforms: ["TikTok", "Instagram"], followers: 412000, growthRate: 18.5, avgEngagement: 9.2, postsPerWeek: 20, topTopic: "AI for Business" },
  { id: 5, name: "Liam Ottley", handle: "@liamottley", avatar: "LO", platforms: ["YouTube", "Twitter", "LinkedIn"], followers: 387000, growthRate: 5.8, avgEngagement: 6.1, postsPerWeek: 6, topTopic: "AI Agencies" },
  { id: 6, name: "Nate Herk", handle: "@nateherk", avatar: "NH", platforms: ["TikTok", "YouTube"], followers: 298000, growthRate: 22.3, avgEngagement: 8.7, postsPerWeek: 18, topTopic: "AI Side Hustles" },
  { id: 7, name: "Corbin Brown", handle: "@corbinbrown", avatar: "CB", platforms: ["YouTube", "LinkedIn"], followers: 245000, growthRate: 7.9, avgEngagement: 5.5, postsPerWeek: 5, topTopic: "AI Development" },
  { id: 8, name: "AI Andy", handle: "@ai_andy_", avatar: "AD", platforms: ["TikTok", "Instagram", "YouTube"], followers: 198000, growthRate: 15.6, avgEngagement: 7.3, postsPerWeek: 14, topTopic: "AI Automation" },
  { id: 9, name: "Samson Vowles", handle: "@samsonvowles", avatar: "SV", platforms: ["YouTube", "Twitter"], followers: 176000, growthRate: 9.1, avgEngagement: 6.8, postsPerWeek: 7, topTopic: "AI Ethics" },
  { id: 10, name: "Igor Pogany", handle: "@igorpogany", avatar: "IP", platforms: ["LinkedIn", "YouTube"], followers: 134000, growthRate: 11.2, avgEngagement: 8.4, postsPerWeek: 10, topTopic: "AI Strategy" },
];

const gapOpportunities = [
  { topic: "AI Agent Orchestration Patterns", score: 94, competitors: 1, demand: "Rising", difficulty: "Medium" },
  { topic: "Local LLM Setup Tutorials", score: 88, competitors: 2, demand: "High", difficulty: "Low" },
  { topic: "AI Content Moderation Tools", score: 85, competitors: 0, demand: "Growing", difficulty: "Low" },
  { topic: "Enterprise AI Deployment Stories", score: 82, competitors: 1, demand: "Stable", difficulty: "Medium" },
  { topic: "AI in Healthcare Explainers", score: 79, competitors: 0, demand: "Rising", difficulty: "High" },
  { topic: "Prompt Engineering for Video Gen", score: 76, competitors: 2, demand: "High", difficulty: "Medium" },
  { topic: "AI Music Production Workflows", score: 73, competitors: 1, demand: "Growing", difficulty: "Medium" },
  { topic: "Claude for Coding Deep Dives", score: 71, competitors: 0, demand: "Rising", difficulty: "Low" },
];

const growthComparisonData = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
  Us: Math.round(85000 + i * 8500 + Math.sin(i * 0.6) * 5000),
  "Matt Wolfe": Math.round(780000 + i * 9000 + Math.sin(i * 0.4) * 8000),
  "AI Jason": Math.round(540000 + i * 11000 + Math.sin(i * 0.5) * 6000),
  "Riley Brown": Math.round(220000 + i * 16000 + Math.sin(i * 0.7) * 7000),
}));

const calendarDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarHours = ["6am", "9am", "12pm", "3pm", "6pm", "9pm"];
const competitorPostData = calendarDays.flatMap((day) =>
  calendarHours.map((hour) => ({
    x: hour,
    y: day,
    value: Math.floor(Math.random() * 15),
  }))
);
const ourPostData = calendarDays.flatMap((day) =>
  calendarHours.map((hour) => ({
    x: hour,
    y: day,
    value: Math.floor(Math.random() * 8),
  }))
);

const platformVariant: Record<string, "danger" | "info" | "warning" | "success" | "default"> = {
  TikTok: "danger",
  Instagram: "info",
  YouTube: "danger",
  Twitter: "info",
  LinkedIn: "info",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntelPage() {
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("All");
  const [sortBy, setSortBy] = useState("followers");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const sorted = [...competitors].sort((a, b) => {
    if (sortBy === "followers") return b.followers - a.followers;
    if (sortBy === "growth") return b.growthRate - a.growthRate;
    if (sortBy === "engagement") return b.avgEngagement - a.avgEngagement;
    return 0;
  });

  const filtered = sorted.filter((c) => {
    if (platformFilter === "All") return true;
    return c.platforms.includes(platformFilter);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eye className="h-6 w-6 text-purple-400" /> Competitor Intelligence
          </h1>
          <p className="text-gray-400 text-sm mt-1">Track {competitors.length} competitors across all platforms</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            options={[
              { value: "All", label: "All Platforms" },
              { value: "TikTok", label: "TikTok" },
              { value: "YouTube", label: "YouTube" },
              { value: "Instagram", label: "Instagram" },
              { value: "LinkedIn", label: "LinkedIn" },
              { value: "Twitter", label: "Twitter" },
            ]}
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          />
          <Select
            options={[
              { value: "followers", label: "Sort: Followers" },
              { value: "growth", label: "Sort: Growth Rate" },
              { value: "engagement", label: "Sort: Engagement" },
            ]}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          />
        </div>
      </div>

      {/* Competitor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((c) => (
          <Card key={c.id} className="hover:border-gray-700 transition-colors group cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  {c.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-gray-500 text-xs">{c.handle}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {c.platforms.map((p) => (
                  <Badge key={p} variant={platformVariant[p]} className="text-[10px]">{p}</Badge>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Followers</p>
                  <p className="text-white font-bold">{formatNumber(c.followers)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Growth</p>
                  <p className="text-emerald-400 font-bold flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />{c.growthRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Engagement</p>
                  <p className="text-blue-400 font-bold">{c.avgEngagement}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Posts/Week</p>
                  <p className="text-gray-300 font-bold">{c.postsPerWeek}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500">Top Topic</p>
                <p className="text-sm text-gray-300 truncate">{c.topTopic}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gap Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-400" />
            Gap Opportunities
          </CardTitle>
          <p className="text-sm text-gray-400">Untapped topics with high demand and low competition</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Opportunity Score</TableHead>
                <TableHead>Competitors Covering</TableHead>
                <TableHead>Demand Trend</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gapOpportunities.map((g, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium text-white">{g.topic}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${g.score}%` }} />
                      </div>
                      <span className="text-emerald-400 font-bold text-sm">{g.score}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={g.competitors === 0 ? "text-emerald-400 font-bold" : "text-gray-300"}>
                      {g.competitors === 0 ? "None" : g.competitors}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.demand === "Rising" ? "success" : g.demand === "High" ? "info" : "default"}>
                      {g.demand}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.difficulty === "Low" ? "success" : g.difficulty === "Medium" ? "warning" : "danger"}>
                      {g.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">Create Content <ChevronRight className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Growth Comparison + Calendar Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              Growth Comparison
            </CardTitle>
            <p className="text-sm text-gray-400">Follower growth: Us vs top 3 competitors (12 months)</p>
          </CardHeader>
          <CardContent>
            <LineChartComponent
              data={growthComparisonData}
              xAxisKey="month"
              height={300}
              showLegend
              lines={[
                { dataKey: "Us", color: "#3b82f6", name: "Us", strokeWidth: 3 },
                { dataKey: "Matt Wolfe", color: "#f472b6", name: "Matt Wolfe" },
                { dataKey: "AI Jason", color: "#a78bfa", name: "AI Jason" },
                { dataKey: "Riley Brown", color: "#f59e0b", name: "Riley Brown" },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitor Posting Times</CardTitle>
              <p className="text-xs text-gray-400">When they post (post volume by day/time)</p>
            </CardHeader>
            <CardContent>
              <HeatMapComponent
                data={competitorPostData}
                xLabels={calendarHours}
                yLabels={calendarDays}
                showValues
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Our Posting Times</CardTitle>
              <p className="text-xs text-gray-400">Our current posting schedule</p>
            </CardHeader>
            <CardContent>
              <HeatMapComponent
                data={ourPostData}
                xLabels={calendarHours}
                yLabels={calendarDays}
                colorScale={{ min: "#111827", mid: "#064e3b", max: "#10b981" }}
                showValues
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
