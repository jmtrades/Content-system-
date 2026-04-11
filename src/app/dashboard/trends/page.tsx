"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Zap,
  Target,
  Clock,
  CheckCircle,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChartComponent } from "@/components/charts/LineChartComponent";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface TrendPrediction {
  id: number;
  topic: string;
  description: string;
  velocity: "accelerating" | "steady" | "decelerating";
  confidence: number;
  crossPlatformScore: number;
  predictedPeak: string;
  currentMentions: number;
  mentionGrowth: number;
  recommendedAction: string;
  platforms: string[];
  category: string;
}

const trends: TrendPrediction[] = [
  {
    id: 1,
    topic: "GPT-5 Release and Capabilities",
    description: "OpenAI's GPT-5 announcement has triggered massive discussion across all platforms. Content creators are racing to produce first-mover explainers and tutorials.",
    velocity: "accelerating",
    confidence: 94,
    crossPlatformScore: 97,
    predictedPeak: "Apr 18, 2026",
    currentMentions: 284000,
    mentionGrowth: 340,
    recommendedAction: "Create a comprehensive GPT-5 breakdown video immediately. Focus on practical use cases and comparisons to GPT-4.5. Short-form content on key features will perform well.",
    platforms: ["TikTok", "YouTube", "Twitter", "LinkedIn"],
    category: "AI Models",
  },
  {
    id: 2,
    topic: "AI Agent Orchestration",
    description: "Multi-agent AI systems are trending as developers and businesses explore autonomous workflows. Sam Altman's recent comments have fueled this further.",
    velocity: "accelerating",
    confidence: 87,
    crossPlatformScore: 82,
    predictedPeak: "Apr 25, 2026",
    currentMentions: 67000,
    mentionGrowth: 185,
    recommendedAction: "Build a demo showing AI agents working together. Tutorial content on setting up multi-agent systems will capture search traffic.",
    platforms: ["YouTube", "Twitter", "LinkedIn"],
    category: "AI Development",
  },
  {
    id: 3,
    topic: "EU AI Act Compliance",
    description: "With enforcement beginning this week, creators and businesses are scrambling to understand disclosure requirements and compliance strategies.",
    velocity: "steady",
    confidence: 91,
    crossPlatformScore: 73,
    predictedPeak: "May 1, 2026",
    currentMentions: 45000,
    mentionGrowth: 120,
    recommendedAction: "Create an explainer video on what the EU AI Act means for content creators. Checklists and compliance guides will drive high engagement.",
    platforms: ["YouTube", "LinkedIn", "Twitter"],
    category: "Regulation",
  },
  {
    id: 4,
    topic: "AI-Generated Video (Runway Gen-4, Sora 2)",
    description: "Latest AI video generation models are producing cinema-quality output. Creators are debating the impact on traditional video production workflows.",
    velocity: "accelerating",
    confidence: 89,
    crossPlatformScore: 91,
    predictedPeak: "Apr 22, 2026",
    currentMentions: 156000,
    mentionGrowth: 210,
    recommendedAction: "Create side-by-side comparison of Gen-4 vs Sora 2. Show practical video production workflows using AI generation. High viral potential on TikTok.",
    platforms: ["TikTok", "YouTube", "Instagram"],
    category: "AI Tools",
  },
  {
    id: 5,
    topic: "Local LLM Deployment",
    description: "With Llama 4 release, interest in running powerful language models locally has surged. Privacy concerns and cost savings are driving adoption.",
    velocity: "steady",
    confidence: 78,
    crossPlatformScore: 68,
    predictedPeak: "May 10, 2026",
    currentMentions: 34000,
    mentionGrowth: 95,
    recommendedAction: "Tutorial on setting up Llama 4 locally with step-by-step guide. Target developers and privacy-conscious users. LinkedIn thought leadership opportunity.",
    platforms: ["YouTube", "Twitter", "LinkedIn"],
    category: "AI Development",
  },
  {
    id: 6,
    topic: "Creator Economy Meets AI Automation",
    description: "The Goldman Sachs $500B creator economy report has sparked debate about AI's role in content creation scaling. New AI tools are enabling solo creators to produce enterprise-level content.",
    velocity: "steady",
    confidence: 83,
    crossPlatformScore: 86,
    predictedPeak: "Apr 30, 2026",
    currentMentions: 89000,
    mentionGrowth: 140,
    recommendedAction: "Create a reaction/analysis video on the Goldman Sachs report. Show your own AI-powered workflow as proof of concept. Story-driven content performs best.",
    platforms: ["YouTube", "TikTok", "LinkedIn", "Instagram"],
    category: "Industry",
  },
  {
    id: 7,
    topic: "Apple Intelligence 2.0",
    description: "Apple's upgraded on-device AI in iOS 20 beta is getting significant attention. Siri's new autonomous capabilities are particularly noteworthy.",
    velocity: "decelerating",
    confidence: 72,
    crossPlatformScore: 79,
    predictedPeak: "Apr 14, 2026",
    currentMentions: 123000,
    mentionGrowth: 45,
    recommendedAction: "If you haven't covered this yet, the window is closing. Quick short-form reaction content still viable. Focus on the unique angle of what this means for AI accessibility.",
    platforms: ["TikTok", "YouTube", "Instagram"],
    category: "AI Models",
  },
  {
    id: 8,
    topic: "AI in Healthcare Diagnostics",
    description: "Several breakthroughs in AI diagnostic accuracy are making mainstream news. The intersection of AI and healthcare is becoming a popular content topic.",
    velocity: "accelerating",
    confidence: 74,
    crossPlatformScore: 62,
    predictedPeak: "May 15, 2026",
    currentMentions: 28000,
    mentionGrowth: 160,
    recommendedAction: "Early-mover advantage available. Create accessible explainer content about AI in healthcare. This topic crosses into general audience territory beyond just AI enthusiasts.",
    platforms: ["YouTube", "LinkedIn"],
    category: "AI Applications",
  },
  {
    id: 9,
    topic: "Prompt Engineering as a Career",
    description: "Job postings for prompt engineers have tripled in Q1 2026. Salary data and career path content is highly searched.",
    velocity: "steady",
    confidence: 81,
    crossPlatformScore: 77,
    predictedPeak: "May 5, 2026",
    currentMentions: 52000,
    mentionGrowth: 88,
    recommendedAction: "Create career guide content: salary expectations, skill requirements, how to break in. Link to prompt engineering templates product for conversion.",
    platforms: ["TikTok", "YouTube", "LinkedIn"],
    category: "Career",
  },
  {
    id: 10,
    topic: "AI Music and Audio Generation",
    description: "New models like Suno v4 and Udio Pro are enabling high-quality music generation. Copyright debates are intensifying.",
    velocity: "decelerating",
    confidence: 68,
    crossPlatformScore: 71,
    predictedPeak: "Apr 12, 2026",
    currentMentions: 41000,
    mentionGrowth: 30,
    recommendedAction: "Trend is past peak but evergreen tutorial content on AI music tools still viable. Copyright angle is the fresh take - create explainer on legal implications.",
    platforms: ["YouTube", "TikTok"],
    category: "AI Tools",
  },
];

const velocityChartData = Array.from({ length: 14 }, (_, i) => ({
  day: `Apr ${i + 1}`,
  "GPT-5": Math.round(20000 + i * 18000 + Math.sin(i * 0.3) * 8000),
  "AI Video": Math.round(15000 + i * 10000 + Math.sin(i * 0.4) * 5000),
  "AI Agents": Math.round(5000 + i * 4500 + Math.sin(i * 0.5) * 3000),
  "EU AI Act": Math.round(3000 + i * 3000 + Math.sin(i * 0.6) * 2000),
}));

const historicalAccuracy = [
  { prediction: "GPT-4.5 Launch Buzz", predicted: "Feb 2026", actual: "Feb 2026", accuracy: 96, result: "correct" },
  { prediction: "TikTok Shop AI Tools Trend", predicted: "Jan 2026", actual: "Jan 2026", accuracy: 91, result: "correct" },
  { prediction: "AI Coding Tools Saturation", predicted: "Dec 2025", actual: "Mar 2026", accuracy: 72, result: "early" },
  { prediction: "YouTube Shorts Algorithm Shift", predicted: "Nov 2025", actual: "Nov 2025", accuracy: 88, result: "correct" },
  { prediction: "AI Ethics Content Surge", predicted: "Oct 2025", actual: "Dec 2025", accuracy: 65, result: "early" },
  { prediction: "Midjourney V6 Viral Wave", predicted: "Sep 2025", actual: "Sep 2025", accuracy: 93, result: "correct" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const velocityConfig: Record<string, { icon: typeof ArrowUp; color: string; label: string; badge: "success" | "info" | "warning" }> = {
  accelerating: { icon: ArrowUp, color: "text-emerald-400", label: "Accelerating", badge: "success" },
  steady: { icon: Activity, color: "text-blue-400", label: "Steady", badge: "info" },
  decelerating: { icon: ArrowDown, color: "text-amber-400", label: "Decelerating", badge: "warning" },
};

const platformBadge: Record<string, "danger" | "info" | "warning" | "success" | "default"> = {
  TikTok: "danger",
  Instagram: "info",
  YouTube: "danger",
  Twitter: "info",
  LinkedIn: "info",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TrendsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const avgAccuracy = Math.round(historicalAccuracy.reduce((s, h) => s + h.accuracy, 0) / historicalAccuracy.length);

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-400" /> Trend Predictions
          </h1>
          <p className="text-gray-400 text-sm mt-1">AI-powered trend detection across {trends.length} active topics</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="gap-1"><Target className="h-3 w-3" /> {avgAccuracy}% avg accuracy</Badge>
          <Badge variant="info" className="gap-1">{trends.filter((t) => t.velocity === "accelerating").length} accelerating</Badge>
        </div>
      </div>

      {/* Trend Velocity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            Trend Velocity
          </CardTitle>
          <p className="text-sm text-gray-400">Mention growth over the last 14 days for top trends</p>
        </CardHeader>
        <CardContent>
          <LineChartComponent
            data={velocityChartData}
            xAxisKey="day"
            height={280}
            showLegend
            lines={[
              { dataKey: "GPT-5", color: "#f87171", name: "GPT-5" },
              { dataKey: "AI Video", color: "#a78bfa", name: "AI Video" },
              { dataKey: "AI Agents", color: "#60a5fa", name: "AI Agents" },
              { dataKey: "EU AI Act", color: "#fbbf24", name: "EU AI Act" },
            ]}
          />
        </CardContent>
      </Card>

      {/* Trend Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {trends.map((trend) => {
          const vel = velocityConfig[trend.velocity];
          const VelIcon = vel.icon;
          return (
            <Card key={trend.id} className="hover:border-gray-700 transition-colors">
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={vel.badge} className="gap-1">
                        <VelIcon className="h-3 w-3" /> {vel.label}
                      </Badge>
                      <Badge variant="default">{trend.category}</Badge>
                    </div>
                    <h3 className="text-white font-semibold text-base">{trend.topic}</h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-white">{trend.confidence}%</div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Confidence</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-400 leading-relaxed mb-3">{trend.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-[10px] text-gray-500 uppercase">Cross-Platform</p>
                    <p className="text-sm font-bold text-blue-400">{trend.crossPlatformScore}/100</p>
                  </div>
                  <div className="p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-[10px] text-gray-500 uppercase">Mentions</p>
                    <p className="text-sm font-bold text-white">{(trend.currentMentions / 1000).toFixed(0)}K</p>
                  </div>
                  <div className="p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-[10px] text-gray-500 uppercase">Growth</p>
                    <p className="text-sm font-bold text-emerald-400">+{trend.mentionGrowth}%</p>
                  </div>
                </div>

                {/* Platforms */}
                <div className="flex items-center gap-1.5 mb-3">
                  {trend.platforms.map((p) => (
                    <Badge key={p} variant={platformBadge[p] || "default"} className="text-[10px]">{p}</Badge>
                  ))}
                  <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Peak: {trend.predictedPeak}
                  </span>
                </div>

                {/* Recommended Action */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3">
                  <p className="text-xs text-blue-400 font-medium mb-1">Recommended Action</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{trend.recommendedAction}</p>
                </div>

                {/* CTA */}
                <Button variant="outline" size="sm" className="w-full gap-1">
                  <Zap className="h-3.5 w-3.5" /> Create Content for This Trend
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Historical Accuracy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            Historical Accuracy
          </CardTitle>
          <p className="text-sm text-gray-400">How accurate our past trend predictions were</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {historicalAccuracy.map((h, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg border border-gray-800/50">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${h.result === "correct" ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                  {h.result === "correct" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{h.prediction}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">Predicted: {h.predicted}</span>
                    <span className="text-xs text-gray-500">Actual: {h.actual}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={h.result === "correct" ? "success" : "warning"}>
                    {h.result === "correct" ? "Correct" : "Early"}
                  </Badge>
                  <span className={`text-sm font-bold ${h.accuracy >= 85 ? "text-emerald-400" : h.accuracy >= 70 ? "text-amber-400" : "text-red-400"}`}>
                    {h.accuracy}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-between">
            <span className="text-sm text-gray-400">Overall Prediction Accuracy</span>
            <span className="text-xl font-bold text-emerald-400">{avgAccuracy}%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
