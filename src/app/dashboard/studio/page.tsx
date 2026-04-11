"use client";

import React, { useState, useEffect } from "react";
import {
  Film,
  FileText,
  Calendar,
  Plus,
  Upload,
  Edit3,
  Trash2,
  CheckCircle,
  Clock,
  Play,
  Pause,
  Eye,
  Zap,
  ChevronRight,
  Video,
  MoreVertical,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface Script {
  id: number;
  title: string;
  hook: string;
  pillar: string;
  platform: string;
  status: "draft" | "approved" | "filmed" | "edited" | "posted";
  wordCount: number;
  createdAt: string;
  estimatedLength: string;
}

const scripts: Script[] = [
  { id: 1, title: "Why GPT-5 Changes Everything for Creators", hook: "OpenAI just dropped a bomb that will change how every creator works forever...", pillar: "AI News", platform: "TikTok", status: "approved", wordCount: 320, createdAt: "2026-04-11", estimatedLength: "1:45" },
  { id: 2, title: "5 AI Tools That Replaced My Entire Team", hook: "I fired my editor, designer, and social media manager. Here's what I use instead...", pillar: "Tools", platform: "YouTube", status: "filmed", wordCount: 1850, createdAt: "2026-04-10", estimatedLength: "12:30" },
  { id: 3, title: "The $0 to $10K AI Business Blueprint", hook: "I went from zero to $10K/month using only free AI tools. Here's the exact blueprint...", pillar: "Business", platform: "YouTube", status: "edited", wordCount: 2100, createdAt: "2026-04-09", estimatedLength: "15:00" },
  { id: 4, title: "Stop Using ChatGPT Like This", hook: "90% of people are using ChatGPT completely wrong and leaving money on the table...", pillar: "Tips", platform: "Instagram", status: "draft", wordCount: 280, createdAt: "2026-04-08", estimatedLength: "1:00" },
  { id: 5, title: "I Built an App in 10 Minutes with Claude", hook: "Watch me build a full production app from scratch in under 10 minutes using nothing but AI...", pillar: "Tutorials", platform: "TikTok", status: "approved", wordCount: 350, createdAt: "2026-04-08", estimatedLength: "2:00" },
  { id: 6, title: "AI Won't Take Your Job (Here's Why)", hook: "Everyone's panicking about AI taking their jobs but they're missing the bigger picture...", pillar: "Opinion", platform: "LinkedIn", status: "posted", wordCount: 450, createdAt: "2026-04-07", estimatedLength: "3:00" },
  { id: 7, title: "How I Automate 80% of My Content Pipeline", hook: "What if I told you I only spend 2 hours a week on content and still post daily everywhere...", pillar: "Business", platform: "YouTube", status: "draft", wordCount: 1600, createdAt: "2026-04-07", estimatedLength: "11:00" },
  { id: 8, title: "The AI Newsletter That Makes Me $3K/mo", hook: "I started an AI newsletter 6 months ago and it now generates $3K in passive income every month...", pillar: "Business", platform: "YouTube", status: "filming", wordCount: 1400, createdAt: "2026-04-06", estimatedLength: "9:30" },
  { id: 9, title: "Reaction: Sam Altman's Latest Interview", hook: "Sam Altman just said something that made the entire AI community lose their minds...", pillar: "AI News", platform: "TikTok", status: "draft", wordCount: 290, createdAt: "2026-04-05", estimatedLength: "1:30" },
  { id: 10, title: "AI-Powered Editing Workflow Tutorial", hook: "My editing workflow used to take 8 hours. Now it takes 45 minutes. Here's exactly how...", pillar: "Tutorials", platform: "YouTube", status: "draft", wordCount: 1900, createdAt: "2026-04-04", estimatedLength: "14:00" },
];

interface VideoJob {
  id: number;
  title: string;
  platform: string;
  status: "queued" | "processing" | "rendering" | "uploading" | "complete" | "error";
  progress: number;
  duration: string;
  fileSize: string;
  startedAt: string;
}

const videoJobs: VideoJob[] = [
  { id: 1, title: "5 AI Tools That Replaced My Team", platform: "YouTube", status: "rendering", progress: 72, duration: "12:30", fileSize: "1.2 GB", startedAt: "2026-04-11T10:30:00Z" },
  { id: 2, title: "GPT-5 Breakdown Short", platform: "TikTok", status: "complete", progress: 100, duration: "1:45", fileSize: "85 MB", startedAt: "2026-04-11T09:00:00Z" },
  { id: 3, title: "$0 to $10K Blueprint", platform: "YouTube", status: "processing", progress: 45, duration: "15:00", fileSize: "1.8 GB", startedAt: "2026-04-11T11:00:00Z" },
  { id: 4, title: "Stop Using ChatGPT Wrong - Reel", platform: "Instagram", status: "uploading", progress: 88, duration: "1:00", fileSize: "42 MB", startedAt: "2026-04-11T08:15:00Z" },
  { id: 5, title: "AI Newsletter Income Proof", platform: "YouTube", status: "queued", progress: 0, duration: "9:30", fileSize: "—", startedAt: "2026-04-11T12:00:00Z" },
];

interface CalendarEvent {
  day: number;
  platform: string;
  title: string;
  time: string;
}

const calendarEvents: CalendarEvent[] = [
  { day: 11, platform: "TikTok", title: "GPT-5 Reaction", time: "2:00 PM" },
  { day: 11, platform: "Instagram", title: "5 AI Tools Reel", time: "5:30 PM" },
  { day: 12, platform: "YouTube", title: "$0 to $10K Blueprint", time: "10:00 AM" },
  { day: 12, platform: "LinkedIn", title: "AI Won't Take Jobs", time: "12:00 PM" },
  { day: 12, platform: "TikTok", title: "Claude App Build", time: "3:00 PM" },
  { day: 13, platform: "Instagram", title: "ChatGPT Tips Reel", time: "9:00 AM" },
  { day: 13, platform: "YouTube", title: "AI Newsletter Video", time: "2:00 PM" },
  { day: 14, platform: "TikTok", title: "Sam Altman Reaction", time: "11:00 AM" },
  { day: 14, platform: "LinkedIn", title: "AI Agents Post", time: "4:00 PM" },
  { day: 15, platform: "YouTube", title: "Editing Workflow", time: "10:00 AM" },
  { day: 16, platform: "TikTok", title: "AI Automation Tips", time: "2:00 PM" },
  { day: 16, platform: "Instagram", title: "Tool Carousel", time: "6:00 PM" },
  { day: 18, platform: "YouTube", title: "Weekly AI Roundup", time: "10:00 AM" },
  { day: 18, platform: "TikTok", title: "Quick Tip: Prompts", time: "3:00 PM" },
  { day: 19, platform: "LinkedIn", title: "AI Hiring Trends", time: "9:00 AM" },
  { day: 20, platform: "YouTube", title: "Claude vs GPT-5", time: "10:00 AM" },
  { day: 21, platform: "TikTok", title: "Audience AMA", time: "7:00 PM" },
  { day: 22, platform: "Instagram", title: "Behind the Scenes", time: "12:00 PM" },
  { day: 25, platform: "YouTube", title: "Monthly Wrap-up", time: "10:00 AM" },
  { day: 28, platform: "TikTok", title: "AI Predictions", time: "2:00 PM" },
  { day: 30, platform: "LinkedIn", title: "Thought Leadership", time: "9:00 AM" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusConfig: Record<string, { variant: "success" | "warning" | "info" | "danger" | "default"; label: string }> = {
  draft: { variant: "default", label: "Draft" },
  approved: { variant: "info", label: "Approved" },
  filmed: { variant: "warning", label: "Filmed" },
  filming: { variant: "warning", label: "Filming" },
  edited: { variant: "success", label: "Edited" },
  posted: { variant: "success", label: "Posted" },
};

const jobStatusConfig: Record<string, { variant: "success" | "warning" | "info" | "danger" | "default"; color: "blue" | "emerald" | "amber" | "red" | "purple" }> = {
  queued: { variant: "default", color: "blue" },
  processing: { variant: "info", color: "blue" },
  rendering: { variant: "warning", color: "amber" },
  uploading: { variant: "info", color: "purple" },
  complete: { variant: "success", color: "emerald" },
  error: { variant: "danger", color: "red" },
};

const platformDot: Record<string, string> = {
  TikTok: "bg-pink-400",
  Instagram: "bg-purple-400",
  YouTube: "bg-red-400",
  LinkedIn: "bg-blue-400",
};

const platformBadge: Record<string, "danger" | "info" | "warning" | "success"> = {
  TikTok: "danger",
  Instagram: "info",
  YouTube: "danger",
  LinkedIn: "info",
};

const pillarColors: Record<string, string> = {
  "AI News": "bg-red-500/10 text-red-400 border-red-500/20",
  Tools: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Business: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Tips: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Tutorials: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Opinion: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StudioPage() {
  const [loading, setLoading] = useState(true);
  const [showGenForm, setShowGenForm] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genPillar, setGenPillar] = useState("AI News");
  const [genPlatform, setGenPlatform] = useState("TikTok");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  // Build calendar grid
  const daysInMonth = 30; // April 2026
  const firstDayOffset = 2; // Wednesday (0=Mon)
  const calendarGrid: (number | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) calendarGrid.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarGrid.push(d);
  while (calendarGrid.length % 7 !== 0) calendarGrid.push(null);

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Film className="h-6 w-6 text-amber-400" /> Content Studio
          </h1>
          <p className="text-gray-400 text-sm mt-1">Create, manage, and publish your content pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setShowGenForm(!showGenForm)}>
            <Zap className="h-4 w-4" /> Generate Script
          </Button>
          <Button className="gap-2">
            <Upload className="h-4 w-4" /> Upload Video
          </Button>
        </div>
      </div>

      {/* Inline Generate Form */}
      {showGenForm && (
        <Card className="border-blue-500/30">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-gray-400 mb-1 block">Topic</label>
                <Input placeholder="e.g. GPT-5 impact on content creators" value={genTopic} onChange={(e) => setGenTopic(e.target.value)} />
              </div>
              <div className="w-40">
                <label className="text-xs text-gray-400 mb-1 block">Content Pillar</label>
                <Select options={Object.keys(pillarColors).map((p) => ({ value: p, label: p }))} value={genPillar} onChange={(e) => setGenPillar(e.target.value)} />
              </div>
              <div className="w-40">
                <label className="text-xs text-gray-400 mb-1 block">Platform</label>
                <Select options={["TikTok", "YouTube", "Instagram", "LinkedIn"].map((p) => ({ value: p, label: p }))} value={genPlatform} onChange={(e) => setGenPlatform(e.target.value)} />
              </div>
              <Button className="gap-2"><Zap className="h-4 w-4" /> Generate</Button>
              <Button variant="ghost" onClick={() => setShowGenForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="scripts">
        <TabsList>
          <TabsTrigger value="scripts" className="gap-1.5"><FileText className="h-4 w-4" /> Scripts</TabsTrigger>
          <TabsTrigger value="videos" className="gap-1.5"><Video className="h-4 w-4" /> Video Queue</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-4 w-4" /> Calendar</TabsTrigger>
        </TabsList>

        {/* Scripts Tab */}
        <TabsContent value="scripts">
          <div className="space-y-3">
            {scripts.map((s) => (
              <Card key={s.id} className="hover:border-gray-700 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant={statusConfig[s.status]?.variant ?? "default"}>
                          {statusConfig[s.status]?.label ?? s.status}
                        </Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${pillarColors[s.pillar] || "bg-gray-800 text-gray-300 border-gray-700"}`}>
                          {s.pillar}
                        </span>
                        <Badge variant={platformBadge[s.platform]}>{s.platform}</Badge>
                        <span className="text-xs text-gray-500">{s.wordCount} words</span>
                        <span className="text-xs text-gray-500">{s.estimatedLength}</span>
                      </div>
                      <h3 className="text-white font-semibold">{s.title}</h3>
                      <p className="text-sm text-gray-400 mt-1 leading-relaxed">{s.hook}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.status === "draft" && (
                        <Button variant="outline" size="sm" className="gap-1"><CheckCircle className="h-3 w-3" /> Approve</Button>
                      )}
                      <Button variant="ghost" size="sm"><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Video Queue Tab */}
        <TabsContent value="videos">
          <div className="space-y-3">
            {videoJobs.map((j) => {
              const config = jobStatusConfig[j.status];
              return (
                <Card key={j.id} className="hover:border-gray-700 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${j.status === "complete" ? "bg-emerald-500/10" : j.status === "error" ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                          {j.status === "complete" ? (
                            <CheckCircle className="h-5 w-5 text-emerald-400" />
                          ) : j.status === "queued" ? (
                            <Clock className="h-5 w-5 text-gray-400" />
                          ) : (
                            <Play className="h-5 w-5 text-blue-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-white font-semibold truncate">{j.title}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant={platformBadge[j.platform]} className="text-[10px]">{j.platform}</Badge>
                            <span className="text-xs text-gray-500">{j.duration}</span>
                            <span className="text-xs text-gray-500">{j.fileSize}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant={config.variant}>{j.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={j.progress} color={config.color} size="sm" className="flex-1" />
                      <span className="text-sm font-bold text-gray-300 w-12 text-right">{j.progress}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>April 2026</CardTitle>
                <div className="flex items-center gap-4">
                  {Object.entries(platformDot).map(([plat, color]) => (
                    <div key={plat} className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-xs text-gray-400">{plat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
                ))}
              </div>
              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((day, idx) => {
                  const events = day ? calendarEvents.filter((e) => e.day === day) : [];
                  const isToday = day === 11;
                  return (
                    <div
                      key={idx}
                      className={`min-h-[100px] rounded-lg p-2 ${
                        day ? "bg-gray-900 border border-gray-800" : "bg-transparent"
                      } ${isToday ? "border-blue-500/50 bg-blue-500/5" : ""}`}
                    >
                      {day && (
                        <>
                          <span className={`text-xs font-medium ${isToday ? "text-blue-400" : day < 11 ? "text-gray-600" : "text-gray-400"}`}>
                            {day}
                          </span>
                          <div className="mt-1 space-y-1">
                            {events.map((ev, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1 group cursor-pointer"
                                title={`${ev.title} - ${ev.time}`}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${platformDot[ev.platform]}`} />
                                <span className="text-[10px] text-gray-400 truncate group-hover:text-white transition-colors">
                                  {ev.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
