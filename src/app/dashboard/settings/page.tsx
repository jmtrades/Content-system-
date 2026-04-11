"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Plus,
  Trash2,
  Globe,
  Clock,
  Activity,
  Eye,
  Save,
  ShoppingCart,
  Rss,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Select available at @/components/ui/select if needed
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface CronJob {
  id: number;
  name: string;
  description: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: "healthy" | "warning" | "error" | "disabled";
  duration: string;
}

const cronJobs: CronJob[] = [
  { id: 1, name: "Radar News Scan", description: "Scans RSS feeds, Twitter, Reddit for AI news", schedule: "Every 30 min", lastRun: "2026-04-11T12:30:00Z", nextRun: "2026-04-11T13:00:00Z", status: "healthy", duration: "12s" },
  { id: 2, name: "Competitor Tracker", description: "Fetches competitor profiles and posting data", schedule: "Every 6 hours", lastRun: "2026-04-11T06:00:00Z", nextRun: "2026-04-11T12:00:00Z", status: "healthy", duration: "45s" },
  { id: 3, name: "Analytics Sync", description: "Pulls analytics from all connected platforms", schedule: "Every 1 hour", lastRun: "2026-04-11T12:00:00Z", nextRun: "2026-04-11T13:00:00Z", status: "healthy", duration: "28s" },
  { id: 4, name: "Trend Analyzer", description: "Analyzes mention velocity and predicts trends", schedule: "Every 2 hours", lastRun: "2026-04-11T10:00:00Z", nextRun: "2026-04-11T12:00:00Z", status: "warning", duration: "1m 34s" },
  { id: 5, name: "Comment Fetcher", description: "Pulls comments and DMs from all platforms", schedule: "Every 15 min", lastRun: "2026-04-11T12:45:00Z", nextRun: "2026-04-11T13:00:00Z", status: "healthy", duration: "8s" },
  { id: 6, name: "Revenue Tracker", description: "Syncs sales data from Stripe, Gumroad, affiliates", schedule: "Every 1 hour", lastRun: "2026-04-11T12:00:00Z", nextRun: "2026-04-11T13:00:00Z", status: "healthy", duration: "5s" },
  { id: 7, name: "Video Processor", description: "Handles video rendering and platform uploads", schedule: "On demand", lastRun: "2026-04-11T11:30:00Z", nextRun: "Waiting for jobs", status: "healthy", duration: "varies" },
  { id: 8, name: "Auto-Poster", description: "Posts scheduled content to connected platforms", schedule: "Every 5 min", lastRun: "2026-04-11T12:50:00Z", nextRun: "2026-04-11T12:55:00Z", status: "error", duration: "2s" },
];

interface PlatformConnection {
  id: number;
  name: string;
  icon: string;
  connected: boolean;
  apiKey: string;
  lastSync: string;
  status: "connected" | "expired" | "disconnected";
}

const platformConnections: PlatformConnection[] = [
  { id: 1, name: "TikTok", icon: "TT", connected: true, apiKey: "tk_****************************3f2a", lastSync: "2m ago", status: "connected" },
  { id: 2, name: "Instagram", icon: "IG", connected: true, apiKey: "ig_****************************8b1c", lastSync: "5m ago", status: "connected" },
  { id: 3, name: "YouTube", icon: "YT", connected: true, apiKey: "yt_****************************4d9e", lastSync: "3m ago", status: "connected" },
  { id: 4, name: "LinkedIn", icon: "LI", connected: true, apiKey: "li_****************************7a3f", lastSync: "8m ago", status: "connected" },
  { id: 5, name: "Twitter/X", icon: "X", connected: true, apiKey: "tw_****************************2c8b", lastSync: "1m ago", status: "connected" },
  { id: 6, name: "Stripe", icon: "ST", connected: true, apiKey: "sk_****************************9f1d", lastSync: "10m ago", status: "connected" },
  { id: 7, name: "Beehiiv", icon: "BH", connected: false, apiKey: "", lastSync: "Never", status: "disconnected" },
  { id: 8, name: "Gumroad", icon: "GR", connected: true, apiKey: "gr_****************************5e2a", lastSync: "15m ago", status: "expired" },
];

interface TrackedCompetitor {
  id: number;
  name: string;
  handle: string;
  platforms: string[];
  tracking: boolean;
}

const trackedCompetitors: TrackedCompetitor[] = [
  { id: 1, name: "Matt Wolfe", handle: "@maboroshi", platforms: ["YouTube", "TikTok", "Twitter"], tracking: true },
  { id: 2, name: "AI Jason", handle: "@ai_jason_", platforms: ["YouTube", "Twitter"], tracking: true },
  { id: 3, name: "The AI Advantage", handle: "@aiadvantage", platforms: ["YouTube", "TikTok", "Instagram"], tracking: true },
  { id: 4, name: "Riley Brown", handle: "@rileybrown_ai", platforms: ["TikTok", "Instagram"], tracking: true },
  { id: 5, name: "Liam Ottley", handle: "@liamottley", platforms: ["YouTube", "Twitter", "LinkedIn"], tracking: true },
  { id: 6, name: "Nate Herk", handle: "@nateherk", platforms: ["TikTok", "YouTube"], tracking: true },
  { id: 7, name: "Corbin Brown", handle: "@corbinbrown", platforms: ["YouTube", "LinkedIn"], tracking: true },
  { id: 8, name: "AI Andy", handle: "@ai_andy_", platforms: ["TikTok", "Instagram", "YouTube"], tracking: false },
];

interface NewsSource {
  id: number;
  name: string;
  type: "rss" | "twitter" | "reddit" | "newsletter";
  url: string;
  enabled: boolean;
  articles: number;
}

const newsSources: NewsSource[] = [
  { id: 1, name: "TechCrunch AI", type: "rss", url: "techcrunch.com/category/ai", enabled: true, articles: 342 },
  { id: 2, name: "The Verge AI", type: "rss", url: "theverge.com/ai-artificial-intelligence", enabled: true, articles: 287 },
  { id: 3, name: "r/MachineLearning", type: "reddit", url: "reddit.com/r/MachineLearning", enabled: true, articles: 1205 },
  { id: 4, name: "r/LocalLLaMA", type: "reddit", url: "reddit.com/r/LocalLLaMA", enabled: true, articles: 876 },
  { id: 5, name: "Sam Altman (@sama)", type: "twitter", url: "twitter.com/sama", enabled: true, articles: 145 },
  { id: 6, name: "Andrej Karpathy", type: "twitter", url: "twitter.com/karpathy", enabled: true, articles: 98 },
  { id: 7, name: "The AI Newsletter", type: "newsletter", url: "theainewsletter.com", enabled: true, articles: 52 },
  { id: 8, name: "Import AI", type: "newsletter", url: "importai.net", enabled: false, articles: 78 },
  { id: 9, name: "Ars Technica AI", type: "rss", url: "arstechnica.com/ai", enabled: true, articles: 198 },
  { id: 10, name: "DeepMind Blog", type: "rss", url: "deepmind.google/blog", enabled: true, articles: 34 },
];

const postingSchedule = [
  { platform: "TikTok", mon: "2:00 PM", tue: "3:00 PM", wed: "2:00 PM", thu: "4:00 PM", fri: "2:00 PM", sat: "11:00 AM", sun: "—" },
  { platform: "Instagram", mon: "—", tue: "5:30 PM", wed: "—", thu: "5:30 PM", fri: "—", sat: "6:00 PM", sun: "—" },
  { platform: "YouTube", mon: "—", tue: "10:00 AM", wed: "—", thu: "—", fri: "10:00 AM", sat: "—", sun: "—" },
  { platform: "LinkedIn", mon: "9:00 AM", tue: "—", wed: "9:00 AM", thu: "—", fri: "9:00 AM", sat: "—", sun: "—" },
];

interface Product {
  id: number;
  name: string;
  price: number;
  type: "course" | "digital" | "service" | "subscription";
  status: "active" | "draft" | "archived";
  sales: number;
}

const products: Product[] = [
  { id: 1, name: "AI Content Mastery Course", price: 297, type: "course", status: "active", sales: 142 },
  { id: 2, name: "Prompt Engineering Templates", price: 47, type: "digital", status: "active", sales: 834 },
  { id: 3, name: "AI Tools Toolkit Bundle", price: 97, type: "digital", status: "active", sales: 312 },
  { id: 4, name: "1-on-1 AI Strategy Call", price: 497, type: "service", status: "active", sales: 18 },
  { id: 5, name: "Monthly AI Newsletter (Pro)", price: 9.99, type: "subscription", status: "active", sales: 420 },
  { id: 6, name: "Content Automation Blueprint", price: 197, type: "course", status: "draft", sales: 15 },
  { id: 7, name: "AI Video Production Guide", price: 147, type: "course", status: "draft", sales: 0 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusColors: Record<string, { bg: string; dot: string; text: string }> = {
  healthy: { bg: "bg-emerald-500/10", dot: "bg-emerald-500", text: "text-emerald-400" },
  warning: { bg: "bg-amber-500/10", dot: "bg-amber-500", text: "text-amber-400" },
  error: { bg: "bg-red-500/10", dot: "bg-red-500", text: "text-red-400" },
  disabled: { bg: "bg-gray-800", dot: "bg-gray-500", text: "text-gray-400" },
  connected: { bg: "bg-emerald-500/10", dot: "bg-emerald-500", text: "text-emerald-400" },
  expired: { bg: "bg-amber-500/10", dot: "bg-amber-500", text: "text-amber-400" },
  disconnected: { bg: "bg-gray-800", dot: "bg-gray-500", text: "text-gray-400" },
};

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState(newsSources);
  const [competitors, setCompetitors] = useState(trackedCompetitors);
  const [testing, setTesting] = useState<number | null>(null);
  const [newCompetitor, setNewCompetitor] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  function toggleSource(id: number) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  function toggleCompetitor(id: number) {
    setCompetitors((prev) => prev.map((c) => (c.id === id ? { ...c, tracking: !c.tracking } : c)));
  }

  function testConnection(id: number) {
    setTesting(id);
    setTimeout(() => setTesting(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-gray-400" /> Settings
        </h1>
        <p className="text-gray-400 text-sm mt-1">Configure your Content Empire systems and integrations</p>
      </div>

      {/* System Health */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-400" /> System Health
            </h2>
            <p className="text-sm text-gray-400">Cron jobs and background processes</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{cronJobs.filter((j) => j.status === "healthy").length} healthy</Badge>
            {cronJobs.filter((j) => j.status === "error").length > 0 && (
              <Badge variant="danger">{cronJobs.filter((j) => j.status === "error").length} error</Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cronJobs.map((job) => {
            const sc = statusColors[job.status];
            return (
              <Card key={job.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                      <span className="text-sm font-semibold text-white">{job.name}</span>
                    </div>
                    <Badge variant={job.status === "healthy" ? "success" : job.status === "warning" ? "warning" : job.status === "error" ? "danger" : "default"} className="text-[10px]">
                      {job.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{job.description}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Schedule</span>
                      <span className="text-gray-300">{job.schedule}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Run</span>
                      <span className="text-gray-300">{formatTime(job.lastRun)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration</span>
                      <span className="text-gray-300">{job.duration}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Platform Connections */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-400" /> Platform Connections
            </h2>
            <p className="text-sm text-gray-400">API keys and service integrations</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platformConnections.map((pc) => {
            const sc = statusColors[pc.status];
            return (
              <Card key={pc.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-300">
                        {pc.icon}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{pc.name}</p>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          <span className={`text-xs ${sc.text}`}>{pc.status}</span>
                          {pc.connected && <span className="text-xs text-gray-500">| Synced {pc.lastSync}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={testing === pc.id}
                      onClick={() => testConnection(pc.id)}
                      className="text-xs"
                    >
                      {testing === pc.id ? "Testing..." : "Test"}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      value={pc.apiKey}
                      placeholder={pc.connected ? undefined : "Enter API key..."}
                      className="text-xs"
                      readOnly={pc.connected}
                    />
                    <Button variant="ghost" size="sm" className="text-xs flex-shrink-0">
                      {pc.connected ? "Update" : "Connect"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" className="gap-2"><Save className="h-4 w-4" /> Save Connections</Button>
        </div>
      </section>

      {/* Competitor Manager + Source Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitor Manager */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-amber-400" /> Competitor Manager
              </CardTitle>
              <CardDescription>Add or remove competitors to track</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Input placeholder="Add competitor handle..." value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)} />
                <Button size="sm" className="gap-1 flex-shrink-0"><Plus className="h-3 w-3" /> Add</Button>
              </div>
              <div className="space-y-2">
                {competitors.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleCompetitor(c.id)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${c.tracking ? "bg-blue-600" : "bg-gray-700"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${c.tracking ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <div>
                        <p className="text-sm text-white font-medium">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.handle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {c.platforms.map((p) => (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{p}</span>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-8 w-8 p-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="gap-2 ml-auto"><Save className="h-4 w-4" /> Save</Button>
            </CardFooter>
          </Card>
        </section>

        {/* Source Manager */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rss className="h-5 w-5 text-orange-400" /> Source Manager
              </CardTitle>
              <CardDescription>Enable or disable news sources for the radar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleSource(s.id)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${s.enabled ? "bg-emerald-600" : "bg-gray-700"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <div>
                        <p className="text-sm text-white font-medium">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={s.type === "rss" ? "warning" : s.type === "twitter" ? "info" : s.type === "reddit" ? "danger" : "default"} className="text-[10px]">
                        {s.type}
                      </Badge>
                      <span className="text-xs text-gray-500">{s.articles} articles</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="gap-2 ml-auto"><Save className="h-4 w-4" /> Save</Button>
            </CardFooter>
          </Card>
        </section>
      </div>

      {/* Posting Schedule */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" /> Posting Schedule
            </CardTitle>
            <CardDescription>Default posting times per platform</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Mon</TableHead>
                  <TableHead>Tue</TableHead>
                  <TableHead>Wed</TableHead>
                  <TableHead>Thu</TableHead>
                  <TableHead>Fri</TableHead>
                  <TableHead>Sat</TableHead>
                  <TableHead>Sun</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postingSchedule.map((row) => (
                  <TableRow key={row.platform}>
                    <TableCell className="font-medium text-white">{row.platform}</TableCell>
                    {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => {
                      const val = row[day as keyof typeof row] as string;
                      return (
                        <TableCell key={day}>
                          {val === "—" ? (
                            <span className="text-gray-600">—</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                              {val}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="gap-2 ml-auto"><Save className="h-4 w-4" /> Save Schedule</Button>
          </CardFooter>
        </Card>
      </section>

      {/* Products */}
      <section>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-emerald-400" /> Products
                </CardTitle>
                <CardDescription>Manage your digital products and services</CardDescription>
              </div>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add Product</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-white">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant={p.type === "course" ? "info" : p.type === "service" ? "warning" : p.type === "subscription" ? "success" : "default"}>
                        {p.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-300">
                      {p.type === "subscription" ? `£${p.price}/mo` : `£${p.price}`}
                    </TableCell>
                    <TableCell className="text-gray-300">{p.sales}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "success" : p.status === "draft" ? "default" : "warning"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Settings className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="gap-2 ml-auto"><Save className="h-4 w-4" /> Save Products</Button>
          </CardFooter>
        </Card>
      </section>
    </div>
  );
}
