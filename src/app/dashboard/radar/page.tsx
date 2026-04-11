"use client";

import React, { useState, useEffect } from "react";
import {
  Radar,
  Search,
  RefreshCw,
  ExternalLink,
  Zap,
  Clock,
  Filter,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { HeatMapComponent } from "@/components/charts/HeatMapComponent";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  sourceType: "rss" | "twitter" | "reddit" | "newsletter" | "blog";
  sourceUrl: string;
  importance: number;
  category: string;
  firstSeen: string;
  processed: boolean;
}

const mockNews: NewsItem[] = [
  { id: 1, title: "OpenAI Announces GPT-5 with Native Video Understanding", summary: "OpenAI revealed GPT-5 today with breakthrough multimodal capabilities including real-time video analysis, 2M context window, and native tool use. Expected to ship in Q3 2026.", source: "The Verge", sourceType: "rss", sourceUrl: "#", importance: 95, category: "AI Models", firstSeen: "2026-04-11T08:30:00Z", processed: false },
  { id: 2, title: "Anthropic Raises $5B Series D at $60B Valuation", summary: "Anthropic closed a massive $5B round led by Google and Spark Capital. The funding will accelerate Claude enterprise adoption and safety research.", source: "TechCrunch", sourceType: "rss", sourceUrl: "#", importance: 88, category: "Industry", firstSeen: "2026-04-11T07:15:00Z", processed: false },
  { id: 3, title: "TikTok Tests AI-Generated Video Ads for Creators", summary: "TikTok is rolling out a beta feature allowing creators to generate short-form video ads using AI, potentially revolutionizing the creator monetization landscape.", source: "@mattshumer", sourceType: "twitter", sourceUrl: "#", importance: 82, category: "Platforms", firstSeen: "2026-04-11T06:00:00Z", processed: true },
  { id: 4, title: "Meta Open Sources Llama 4 with MoE Architecture", summary: "Meta released Llama 4 as open source, featuring a Mixture-of-Experts architecture with 400B total parameters but only 52B active. Benchmarks rival GPT-4.5.", source: "r/MachineLearning", sourceType: "reddit", sourceUrl: "#", importance: 91, category: "AI Models", firstSeen: "2026-04-11T05:30:00Z", processed: false },
  { id: 5, title: "YouTube Shorts Monetization Update: Higher RPMs Incoming", summary: "YouTube announced a significant increase in Shorts RPMs starting May 2026, with creators earning up to 3x more per 1000 views on short-form content.", source: "Creator Insider", sourceType: "blog", sourceUrl: "#", importance: 78, category: "Monetization", firstSeen: "2026-04-11T04:00:00Z", processed: false },
  { id: 6, title: "AI-Powered Content Repurposing Tools See 300% Growth", summary: "The market for AI content repurposing tools has tripled in the last quarter, with Opus Clip, Vizard, and new entrants competing for creator attention.", source: "The Information", sourceType: "newsletter", sourceUrl: "#", importance: 72, category: "Tools", firstSeen: "2026-04-11T03:45:00Z", processed: true },
  { id: 7, title: "Google DeepMind Achieves AGI Benchmark Milestone", summary: "DeepMind's latest model scored above human baseline on the ARC-AGI-2 benchmark, reigniting the AGI timeline debate across the AI research community.", source: "DeepMind Blog", sourceType: "blog", sourceUrl: "#", importance: 94, category: "AI Research", firstSeen: "2026-04-10T22:00:00Z", processed: false },
  { id: 8, title: "EU AI Act Enforcement Begins: What Creators Need to Know", summary: "The EU AI Act's first enforcement provisions take effect this week. Content creators using AI must now disclose AI-generated content or face fines up to 7% of revenue.", source: "Reuters", sourceType: "rss", sourceUrl: "#", importance: 85, category: "Regulation", firstSeen: "2026-04-10T20:00:00Z", processed: false },
  { id: 9, title: "Midjourney V7 Launches with Real-Time Generation", summary: "Midjourney V7 enables near-instant image generation with unprecedented quality. The web app now supports live editing and consistent character generation.", source: "@midjourney", sourceType: "twitter", sourceUrl: "#", importance: 76, category: "AI Models", firstSeen: "2026-04-10T18:30:00Z", processed: true },
  { id: 10, title: "LinkedIn Algorithm Change Favors Long-Form AI Content", summary: "LinkedIn's latest algorithm update significantly boosts reach for long-form posts discussing AI and technology, creating a window of opportunity for thought leadership content.", source: "Social Media Today", sourceType: "rss", sourceUrl: "#", importance: 68, category: "Platforms", firstSeen: "2026-04-10T16:00:00Z", processed: false },
  { id: 11, title: "Apple Intelligence 2.0 Ships with iOS 20 Beta", summary: "Apple's upgraded on-device AI suite brings conversation memory, app orchestration, and private cloud compute to iPhone. Siri can now chain multi-step tasks autonomously.", source: "9to5Mac", sourceType: "rss", sourceUrl: "#", importance: 83, category: "AI Models", firstSeen: "2026-04-10T14:00:00Z", processed: false },
  { id: 12, title: "Creator Economy Hits $500B: AI as the Catalyst", summary: "A new Goldman Sachs report values the creator economy at $500B, attributing 40% of recent growth to AI-enabled content production and distribution tools.", source: "Goldman Sachs Research", sourceType: "newsletter", sourceUrl: "#", importance: 74, category: "Industry", firstSeen: "2026-04-10T12:00:00Z", processed: true },
  { id: 13, title: "Runway Gen-4 Enables Full Short Film Generation", summary: "Runway's Gen-4 model can now generate coherent 3-minute short films from text prompts with consistent characters, lighting, and narrative structure.", source: "r/StableDiffusion", sourceType: "reddit", sourceUrl: "#", importance: 87, category: "AI Models", firstSeen: "2026-04-10T10:00:00Z", processed: false },
  { id: 14, title: "New Study: AI Content Outperforms Human Content on Engagement", summary: "A Stanford study of 50,000 social media posts found AI-assisted content received 34% higher engagement than purely human-created content across all platforms.", source: "Stanford HAI", sourceType: "blog", sourceUrl: "#", importance: 79, category: "AI Research", firstSeen: "2026-04-10T08:00:00Z", processed: false },
  { id: 15, title: "Stripe Launches AI Revenue Dashboard for Creators", summary: "Stripe released a dedicated dashboard for content creators that uses AI to predict revenue trends, optimize pricing, and identify highest-value audience segments.", source: "Stripe Blog", sourceType: "blog", sourceUrl: "#", importance: 65, category: "Tools", firstSeen: "2026-04-10T06:00:00Z", processed: true },
  { id: 16, title: "Sam Altman Predicts Autonomous AI Agents by 2027", summary: "In a new interview, Sam Altman stated that fully autonomous AI agents capable of performing multi-day knowledge work will arrive by early 2027.", source: "@sama", sourceType: "twitter", sourceUrl: "#", importance: 81, category: "Industry", firstSeen: "2026-04-09T22:00:00Z", processed: false },
  { id: 17, title: "Instagram Reels Now Supports AI Voice Cloning for Creators", summary: "Instagram launched an AI voice cloning feature allowing verified creators to narrate Reels in their own AI-generated voice, enabling faster content production.", source: "Instagram Blog", sourceType: "blog", sourceUrl: "#", importance: 73, category: "Platforms", firstSeen: "2026-04-09T18:00:00Z", processed: false },
  { id: 18, title: "Cursor IDE Reaches 10M Users, Valued at $8B", summary: "AI-powered code editor Cursor hit 10 million active users and raised at an $8B valuation. The tool has become the default for many AI-assisted development workflows.", source: "Bloomberg", sourceType: "rss", sourceUrl: "#", importance: 62, category: "Tools", firstSeen: "2026-04-09T14:00:00Z", processed: true },
];

const sourceTypeColors: Record<string, { bg: string; text: string }> = {
  rss: { bg: "bg-orange-500/10", text: "text-orange-400" },
  twitter: { bg: "bg-sky-500/10", text: "text-sky-400" },
  reddit: { bg: "bg-orange-600/10", text: "text-orange-500" },
  newsletter: { bg: "bg-purple-500/10", text: "text-purple-400" },
  blog: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
};

const categories = ["All", "AI Models", "Industry", "Platforms", "Monetization", "Tools", "AI Research", "Regulation"];
const sources = ["All", "rss", "twitter", "reddit", "newsletter", "blog"];

/* ------------------------------------------------------------------ */
/*  Heatmap mock data                                                  */
/* ------------------------------------------------------------------ */

const heatmapCategories = ["AI Models", "Industry", "Platforms", "Tools", "Research", "Regulation"];
const heatmapDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const heatmapData = heatmapCategories.flatMap((cat) =>
  heatmapDays.map((day) => ({
    x: day,
    y: cat,
    value: Math.floor(Math.random() * 20),
  }))
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RadarPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NewsItem[]>(mockNews);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [processedFilter, setProcessedFilter] = useState<"all" | "processed" | "unprocessed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/radar/items?limit=50&min_importance=0');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setItems(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch radar items:', err);
        // Falls back to mock data already in state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredItems = items.filter((item) => {
    if (sourceFilter !== "All" && item.sourceType !== sourceFilter) return false;
    if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
    if (processedFilter === "processed" && !item.processed) return false;
    if (processedFilter === "unprocessed" && item.processed) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setToast(json.message || 'Scan completed successfully!');
        // Re-fetch items after scan
        try {
          const itemsRes = await fetch('/api/radar/items?limit=50&min_importance=0');
          if (itemsRes.ok) {
            const itemsJson = await itemsRes.json();
            if (itemsJson.success && itemsJson.data) {
              setItems(itemsJson.data);
            }
          }
        } catch {
          // ignore re-fetch failure
        }
      } else {
        setToast('Scan triggered but returned an error. Check logs.');
      }
    } catch (err) {
      console.error('Scan failed:', err);
      setToast('Scan request failed. Please try again.');
    } finally {
      setScanning(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  function timeSince(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function importanceColor(score: number) {
    if (score >= 80) return "bg-red-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-gray-500";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <span className="text-sm text-gray-200">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-200 text-sm">x</button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-sm">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radar className="h-6 w-6 text-blue-400" /> Radar News Feed
          </h1>
          <p className="text-gray-400 text-sm mt-1">Monitoring {items.length} sources for content opportunities</p>
        </div>
        <Button onClick={handleScan} loading={scanning} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          Scan Now
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-gray-400">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            <div className="w-40">
              <Select
                options={sources.map((s) => ({ value: s, label: s === "All" ? "All Sources" : s.charAt(0).toUpperCase() + s.slice(1) }))}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              />
            </div>
            <div className="w-44">
              <Select
                options={categories.map((c) => ({ value: c, label: c === "All" ? "All Categories" : c }))}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>
            <div className="w-44">
              <Select
                options={[
                  { value: "all", label: "All Items" },
                  { value: "unprocessed", label: "Unprocessed" },
                  { value: "processed", label: "Processed" },
                ]}
                value={processedFilter}
                onChange={(e) => setProcessedFilter(e.target.value as "all" | "processed" | "unprocessed")}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search headlines..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Feed */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{filteredItems.length} items</span>
          </div>
          {filteredItems.map((item) => (
            <Card key={item.id} className="hover:border-gray-700 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Source + Time */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceTypeColors[item.sourceType].bg} ${sourceTypeColors[item.sourceType].text}`}>
                        {item.source}
                      </span>
                      <Badge variant={item.category === "AI Models" ? "info" : item.category === "Industry" ? "warning" : "default"}>
                        {item.category}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeSince(item.firstSeen)}
                      </span>
                      {item.processed && <Badge variant="success">Processed</Badge>}
                    </div>

                    {/* Title */}
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="group">
                      <h3 className="text-white font-semibold text-base group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                        {item.title}
                        <ExternalLink className="h-3.5 w-3.5 text-gray-600 group-hover:text-blue-400 flex-shrink-0" />
                      </h3>
                    </a>

                    {/* Summary */}
                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">{item.summary}</p>

                    {/* Importance Bar */}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-xs text-gray-500 w-20">Importance</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${importanceColor(item.importance)}`}
                          style={{ width: `${item.importance}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${item.importance >= 80 ? "text-red-400" : item.importance >= 60 ? "text-amber-400" : "text-gray-400"}`}>
                        {item.importance}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  {!item.processed && (
                    <Button variant="outline" size="sm" className="flex-shrink-0 gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      Generate Script
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Topic Distribution</CardTitle>
              <p className="text-xs text-gray-400">Mentions by category over the week</p>
            </CardHeader>
            <CardContent>
              <HeatMapComponent
                data={heatmapData}
                xLabels={heatmapDays}
                yLabels={heatmapCategories}
                showValues
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: "Unprocessed", value: items.filter((i) => !i.processed).length, color: "text-amber-400" },
                  { label: "High Importance (80+)", value: items.filter((i) => i.importance >= 80).length, color: "text-red-400" },
                  { label: "Processed Today", value: items.filter((i) => i.processed).length, color: "text-emerald-400" },
                  { label: "Unique Sources", value: new Set(items.map((i) => i.source)).size, color: "text-blue-400" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <span className="text-sm text-gray-400">{s.label}</span>
                    <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
