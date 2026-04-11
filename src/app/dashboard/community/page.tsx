"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  MessageCircle,
  Heart,
  Send,
  XCircle,
  Filter,
  Star,
  DollarSign,
  Eye,
  Target,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface Comment {
  id: number;
  author: string;
  handle: string;
  platform: string;
  postTitle: string;
  text: string;
  sentiment: "positive" | "negative" | "neutral" | "question";
  autoResponse: string;
  responded: boolean;
  time: string;
  likes: number;
}

const mockComments: Comment[] = [
  { id: 1, author: "Sarah Chen", handle: "@sarahchenai", platform: "TikTok", postTitle: "I Replaced My Marketing Team with AI Agents", text: "This is insane! Can you share what specific AI agents you're using? I want to set this up for my e-commerce brand ASAP.", sentiment: "question", autoResponse: "Great question Sarah! I use a combination of custom GPT agents for copywriting, Jasper for social media scheduling, and a Claude-based agent for customer support. I'll do a detailed breakdown in my next video!", responded: false, time: "15m ago", likes: 24 },
  { id: 2, author: "Mike Johnson", handle: "@mikejdev", platform: "YouTube", postTitle: "The $0 to $10K AI Business Blueprint", text: "Been following your content for months and finally hit $5K/month using your AI agency model. Thank you for putting out this free content!", sentiment: "positive", autoResponse: "That's amazing Mike! Congratulations on hitting $5K/month! Love seeing the community win. Would you be open to sharing your story in a future video?", responded: false, time: "32m ago", likes: 89 },
  { id: 3, author: "Emma Williams", handle: "@emmawrites", platform: "Instagram", postTitle: "5 AI Tools That Replaced My Entire Team", text: "This is misleading. AI can't replace human creativity. These tools are just assistants at best.", sentiment: "negative", autoResponse: "You raise a fair point Emma! I should clarify - I didn't literally replace my team. These tools handle the repetitive 80% so I can focus on the creative 20%. AI augments human creativity, it doesn't replace it.", responded: false, time: "1h ago", likes: 12 },
  { id: 4, author: "David Park", handle: "@dpark_tech", platform: "LinkedIn", postTitle: "AI Won't Take Your Job", text: "Thoughtful perspective. I've been saying the same thing in my enterprise consulting work. The real risk is in not adapting, not in the technology itself.", sentiment: "positive", autoResponse: "Exactly David! The companies I work with that embrace AI augmentation are seeing 3-5x productivity gains. The ones resisting are falling behind. Would love to connect and share insights!", responded: true, time: "2h ago", likes: 156 },
  { id: 5, author: "Lisa Torres", handle: "@lisatorres", platform: "TikTok", postTitle: "Stop Using ChatGPT Like This", text: "Wait what?? I've been doing it wrong this whole time? Can you do a part 2 with more examples?", sentiment: "question", autoResponse: "Part 2 is already filmed and dropping Thursday! Make sure you follow so you don't miss it. I go even deeper into advanced prompting techniques.", responded: false, time: "2h ago", likes: 67 },
  { id: 6, author: "James Wright", handle: "@jwright", platform: "YouTube", postTitle: "The $0 to $10K AI Business Blueprint", text: "How much of this is actually scalable? Seems like the initial setup time would eat into any productivity gains.", sentiment: "neutral", autoResponse: "Great observation James! The initial setup takes about 2-3 weeks, but after that you're saving 20+ hours per week. I have a full ROI breakdown in the course if you want the detailed numbers.", responded: false, time: "3h ago", likes: 18 },
  { id: 7, author: "Aisha Patel", handle: "@aisha_ai", platform: "TikTok", postTitle: "I Built an App in 10 Minutes with Claude", text: "NO WAY. I just tried this and it actually works!! Built a full CRM for my freelance business. You just saved me $200/month on software!", sentiment: "positive", autoResponse: "That's exactly why I made this video Aisha! So many people are paying for SaaS tools they could build themselves with AI. Love that you took action immediately!", responded: false, time: "3h ago", likes: 234 },
  { id: 8, author: "Tom Richards", handle: "@tomr_tech", platform: "Instagram", postTitle: "5 AI Tools That Replaced My Entire Team", text: "What about data privacy? Using AI tools means sending sensitive business data to third parties. Thoughts?", sentiment: "question", autoResponse: "Super important point Tom! I actually addressed this in a video last week. For sensitive data, I use self-hosted models like Llama. For everything else, I check each tool's data policy. Happy to do a deep dive on AI privacy!", responded: false, time: "4h ago", likes: 43 },
  { id: 9, author: "Rachel Kim", handle: "@rachelk", platform: "YouTube", postTitle: "The Truth About AI Side Hustles", text: "This is the most honest video about AI side hustles I've seen. Most creators just sell the dream but you showed the real numbers. Subscribed.", sentiment: "positive", autoResponse: "Thank you Rachel! I believe in transparency. The AI space has too much hype and not enough reality. Welcome to the community!", responded: true, time: "5h ago", likes: 78 },
  { id: 10, author: "Chris Martin", handle: "@chrismartin_", platform: "LinkedIn", postTitle: "AI Won't Take Your Job", text: "Disagree. AI is already replacing junior copywriters and basic design roles at my agency. The job displacement is real and happening now.", sentiment: "negative", autoResponse: "I appreciate the pushback Chris. You're right that certain roles are being displaced, especially task-based ones. My argument is that new roles are being created faster - AI trainers, prompt engineers, AI-augmented creatives. Would love to discuss further!", responded: false, time: "5h ago", likes: 92 },
  { id: 11, author: "Nina Gupta", handle: "@ninagupta", platform: "TikTok", postTitle: "Day in the Life of an AI Content Creator", text: "Your morning routine with AI is goals! What time do you actually wake up to fit all this in?", sentiment: "question", autoResponse: "I typically wake up at 6am! The AI tools handle most of the heavy lifting while I sleep, so my mornings are actually pretty chill. I'll share my full daily schedule in a future video!", responded: false, time: "6h ago", likes: 31 },
  { id: 12, author: "Alex Rivera", handle: "@alexrivera", platform: "Instagram", postTitle: "AI Automation Tips", text: "I love how you simplify complex topics. Your content has helped me automate 60% of my workflow. Keep it up!", sentiment: "positive", autoResponse: "That means the world Alex! 60% automation is incredible. If you want to push it even further, check out my AI Content Mastery course - it covers the advanced automation techniques.", responded: false, time: "7h ago", likes: 55 },
  { id: 13, author: "Peter Lang", handle: "@peterlang", platform: "YouTube", postTitle: "The AI Newsletter That Makes Me $3K/mo", text: "What email platform do you use? And what's your list size? I'm at 2K subscribers and only making $100/month.", sentiment: "question", autoResponse: "I use Beehiiv for the newsletter! My list is at 8.4K subscribers. The key difference is monetization strategy - I use a mix of premium tiers, affiliate partnerships, and sponsored sections. Happy to break this down in a video!", responded: false, time: "8h ago", likes: 38 },
  { id: 14, author: "Sofia Hernandez", handle: "@sofiahernandez", platform: "TikTok", postTitle: "Why GPT-5 Changes Everything", text: "Just signed up for your course after watching this. If GPT-5 is as game-changing as you say, I want to be ready.", sentiment: "positive", autoResponse: "Amazing decision Sofia! You're going to love the course. The GPT-5 module is being updated right now with the latest features. Welcome aboard!", responded: false, time: "9h ago", likes: 19 },
  { id: 15, author: "Mark Thompson", handle: "@markthompson", platform: "LinkedIn", postTitle: "How to Automate Content with AI Agents", text: "How does this compare to traditional marketing automation tools like HubSpot? Is AI actually better or just different?", sentiment: "question", autoResponse: "Great comparison Mark! Traditional tools follow rigid rules, while AI agents adapt and learn. HubSpot is great for structured workflows, but AI agents excel at creative tasks like content generation and personalized outreach. They're complementary, not competitive.", responded: false, time: "10h ago", likes: 64 },
];

interface DM {
  id: number;
  author: string;
  handle: string;
  platform: string;
  lastMessage: string;
  status: "unread" | "read" | "replied" | "flagged";
  time: string;
  intent: "collab" | "support" | "sales" | "general";
}

const mockDMs: DM[] = [
  { id: 1, author: "TechBrand Inc.", handle: "@techbrand", platform: "Instagram", lastMessage: "Hi! We'd love to sponsor your next AI tools video. Our budget is $5,000 for a 60-second integration. Interested?", status: "unread", time: "30m ago", intent: "collab" },
  { id: 2, author: "Jessica Moore", handle: "@jessicamoore", platform: "TikTok", lastMessage: "Hey! I run a SaaS startup and want to hire you for AI consulting. Can we set up a call this week?", status: "unread", time: "1h ago", intent: "sales" },
  { id: 3, author: "Ryan Chen", handle: "@ryanchen", platform: "YouTube", lastMessage: "I bought your course but can't access Module 3. Can you help?", status: "replied", time: "3h ago", intent: "support" },
  { id: 4, author: "CreatorCollab", handle: "@creatorcollab", platform: "LinkedIn", lastMessage: "Would you be interested in a cross-promotion? I have 200K followers in the AI space.", status: "flagged", time: "5h ago", intent: "collab" },
  { id: 5, author: "Anna Smith", handle: "@annasmith_ai", platform: "Instagram", lastMessage: "Your prompt engineering templates changed my freelancing career. Just landed a $10K client! Thank you!", status: "read", time: "8h ago", intent: "general" },
];

interface PotentialCustomer {
  id: number;
  name: string;
  handle: string;
  platform: string;
  signals: string[];
  score: number;
  lastActivity: string;
  estimatedValue: number;
}

const potentialCustomers: PotentialCustomer[] = [
  { id: 1, name: "Sarah Chen", handle: "@sarahchenai", platform: "TikTok", signals: ["Asked about AI agents", "Visited course page 3x", "High engagement"], score: 95, lastActivity: "15m ago", estimatedValue: 297 },
  { id: 2, name: "Jessica Moore", handle: "@jessicamoore", platform: "TikTok", signals: ["DM about consulting", "Shared 5 posts", "Runs SaaS startup"], score: 92, lastActivity: "1h ago", estimatedValue: 497 },
  { id: 3, name: "Sofia Hernandez", handle: "@sofiahernandez", platform: "TikTok", signals: ["Mentioned buying course", "GPT-5 thread engagement"], score: 88, lastActivity: "9h ago", estimatedValue: 297 },
  { id: 4, name: "Peter Lang", handle: "@peterlang", platform: "YouTube", signals: ["Newsletter questions", "Clicked affiliate links", "Power commenter"], score: 85, lastActivity: "8h ago", estimatedValue: 47 },
  { id: 5, name: "Tom Richards", handle: "@tomr_tech", platform: "Instagram", signals: ["Data privacy concerns", "Enterprise use case", "High follower count"], score: 78, lastActivity: "4h ago", estimatedValue: 497 },
  { id: 6, name: "Mark Thompson", handle: "@markthompson", platform: "LinkedIn", signals: ["HubSpot comparison", "Enterprise buyer signals", "Manager title"], score: 82, lastActivity: "10h ago", estimatedValue: 297 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const sentimentConfig: Record<string, { variant: "success" | "danger" | "default" | "warning"; label: string }> = {
  positive: { variant: "success", label: "Positive" },
  negative: { variant: "danger", label: "Negative" },
  neutral: { variant: "default", label: "Neutral" },
  question: { variant: "warning", label: "Question" },
};

const dmStatusConfig: Record<string, { variant: "danger" | "info" | "success" | "warning"; label: string }> = {
  unread: { variant: "danger", label: "Unread" },
  read: { variant: "info", label: "Read" },
  replied: { variant: "success", label: "Replied" },
  flagged: { variant: "warning", label: "Flagged" },
};

const intentConfig: Record<string, { variant: "success" | "info" | "warning" | "default"; label: string }> = {
  collab: { variant: "info", label: "Collab" },
  support: { variant: "warning", label: "Support" },
  sales: { variant: "success", label: "Sales" },
  general: { variant: "default", label: "General" },
};

const platformBadge: Record<string, "danger" | "info" | "warning" | "success"> = {
  TikTok: "danger",
  Instagram: "info",
  YouTube: "danger",
  LinkedIn: "info",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CommunityPage() {
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>(mockComments);
  const [dms, setDms] = useState<DM[]>(mockDMs);
  const [platformFilter, setPlatformFilter] = useState("All");
  const [sentimentFilter, setSentimentFilter] = useState("All");
  const [respondedFilter, setRespondedFilter] = useState("All");
  const [editingResponse, setEditingResponse] = useState<number | null>(null);
  const [editedText, setEditedText] = useState("");
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [commentsRes, dmsRes] = await Promise.allSettled([
          fetch('/api/community/comments?limit=50'),
          fetch('/api/community/dms'),
        ]);

        if (commentsRes.status === 'fulfilled' && commentsRes.value.ok) {
          const json = await commentsRes.value.json();
          if (json.success && json.data) {
            setComments(json.data);
          }
        }

        if (dmsRes.status === 'fulfilled' && dmsRes.value.ok) {
          const json = await dmsRes.value.json();
          if (json.success && json.data) {
            setDms(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch community data:', err);
        setError('Some community data could not be loaded. Showing cached data.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredComments = comments.filter((c) => {
    if (platformFilter !== "All" && c.platform !== platformFilter) return false;
    if (sentimentFilter !== "All" && c.sentiment !== sentimentFilter) return false;
    if (respondedFilter === "Responded" && !c.responded) return false;
    if (respondedFilter === "Pending" && c.responded) return false;
    return true;
  });

  async function handleRespond(id: number) {
    setRespondingId(id);
    const comment = comments.find((c) => c.id === id);
    const responseText = editingResponse === id ? editedText : comment?.autoResponse || '';
    try {
      const res = await fetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: id, response: responseText }),
      });
      if (res.ok) {
        setToast('Response sent successfully!');
      } else {
        setToast('Response sent (locally). API returned an error.');
      }
    } catch (err) {
      console.error('Failed to post response:', err);
      setToast('Response saved locally. API unavailable.');
    } finally {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, responded: true } : c)));
      setEditingResponse(null);
      setRespondingId(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  function startEditing(id: number, text: string) {
    setEditingResponse(id);
    setEditedText(text);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500/90 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

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
            <MessageSquare className="h-6 w-6 text-blue-400" /> Community Management
          </h1>
          <p className="text-gray-400 text-sm mt-1">Engage with your audience across all platforms</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="danger" className="gap-1">
            {comments.filter((c) => !c.responded).length} pending
          </Badge>
          <Badge variant="info" className="gap-1">
            {dms.filter((d) => d.status === "unread").length} unread DMs
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="comments">
        <TabsList>
          <TabsTrigger value="comments" className="gap-1.5"><MessageCircle className="h-4 w-4" /> Comments</TabsTrigger>
          <TabsTrigger value="dms" className="gap-1.5"><Send className="h-4 w-4" /> DMs</TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5"><Star className="h-4 w-4" /> Potential Customers</TabsTrigger>
        </TabsList>

        {/* Comments Tab */}
        <TabsContent value="comments">
          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-gray-400" />
                <Select
                  options={[{ value: "All", label: "All Platforms" }, ...["TikTok", "Instagram", "YouTube", "LinkedIn"].map((p) => ({ value: p, label: p }))]}
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                />
                <Select
                  options={[{ value: "All", label: "All Sentiments" }, ...["positive", "negative", "neutral", "question"].map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]}
                  value={sentimentFilter}
                  onChange={(e) => setSentimentFilter(e.target.value)}
                />
                <Select
                  options={[{ value: "All", label: "All Status" }, { value: "Pending", label: "Pending" }, { value: "Responded", label: "Responded" }]}
                  value={respondedFilter}
                  onChange={(e) => setRespondedFilter(e.target.value)}
                />
                <span className="text-sm text-gray-500 ml-auto">{filteredComments.length} comments</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {filteredComments.map((c) => {
              const sConfig = sentimentConfig[c.sentiment];
              return (
                <Card key={c.id} className={`transition-colors ${c.responded ? "opacity-70" : "hover:border-gray-700"}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {c.author.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-semibold text-sm">{c.author}</span>
                          <span className="text-gray-500 text-xs">{c.handle}</span>
                          <Badge variant={platformBadge[c.platform]} className="text-[10px]">{c.platform}</Badge>
                          <Badge variant={sConfig.variant} className="text-[10px]">{sConfig.label}</Badge>
                          {c.responded && <Badge variant="success" className="text-[10px]">Responded</Badge>}
                          <span className="text-xs text-gray-500 ml-auto">{c.time}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">on: {c.postTitle}</p>
                        <p className="text-sm text-gray-200 leading-relaxed mb-3">{c.text}</p>
                        <div className="flex items-center gap-2 mb-3">
                          <Heart className="h-3 w-3 text-gray-500" />
                          <span className="text-xs text-gray-500">{c.likes}</span>
                        </div>

                        {/* Auto Response */}
                        {!c.responded && (
                          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-2 font-medium">Suggested Response:</p>
                            {editingResponse === c.id ? (
                              <textarea
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                              />
                            ) : (
                              <p className="text-sm text-gray-300 leading-relaxed">{c.autoResponse}</p>
                            )}
                            <div className="flex items-center gap-2 mt-3">
                              <Button size="sm" className="gap-1" onClick={() => handleRespond(c.id)} loading={respondingId === c.id}>
                                <Send className="h-3 w-3" /> {respondingId === c.id ? 'Sending...' : 'Respond'}
                              </Button>
                              {editingResponse !== c.id ? (
                                <Button variant="outline" size="sm" onClick={() => startEditing(c.id, c.autoResponse)}>
                                  Edit
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => setEditingResponse(null)}>
                                  Done Editing
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-gray-500" onClick={() => handleRespond(c.id)}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Ignore
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* DMs Tab */}
        <TabsContent value="dms">
          <div className="space-y-3">
            {dms.map((dm) => {
              const sConfig = dmStatusConfig[dm.status];
              const iConfig = intentConfig[dm.intent];
              return (
                <Card key={dm.id} className={`hover:border-gray-700 transition-colors ${dm.status === "unread" ? "border-blue-500/30" : ""}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {dm.author.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-semibold text-sm">{dm.author}</span>
                          <span className="text-gray-500 text-xs">{dm.handle}</span>
                          <Badge variant={platformBadge[dm.platform]} className="text-[10px]">{dm.platform}</Badge>
                          <Badge variant={sConfig.variant} className="text-[10px]">{sConfig.label}</Badge>
                          <Badge variant={iConfig.variant} className="text-[10px]">{iConfig.label}</Badge>
                          <span className="text-xs text-gray-500 ml-auto">{dm.time}</span>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed mt-2">{dm.lastMessage}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <Button size="sm" className="gap-1"><Send className="h-3 w-3" /> Reply</Button>
                          {dm.intent === "sales" && (
                            <Button variant="outline" size="sm" className="gap-1 text-emerald-400 border-emerald-500/30">
                              <DollarSign className="h-3 w-3" /> Mark as Lead
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Potential Customers Tab */}
        <TabsContent value="customers">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {potentialCustomers.map((pc) => (
              <Card key={pc.id} className="hover:border-gray-700 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white font-bold text-sm">
                        {pc.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{pc.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">{pc.handle}</span>
                          <Badge variant={platformBadge[pc.platform]} className="text-[10px]">{pc.platform}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Target className="h-3.5 w-3.5 text-amber-400" />
                        <span className={`text-sm font-bold ${pc.score >= 90 ? "text-emerald-400" : pc.score >= 80 ? "text-amber-400" : "text-gray-300"}`}>
                          {pc.score}%
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{pc.lastActivity}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {pc.signals.map((s, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-400">Est. {pc.estimatedValue > 100 ? `£${pc.estimatedValue}` : `£${pc.estimatedValue}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-xs"><Eye className="h-3 w-3" /> View</Button>
                      <Button size="sm" className="gap-1 text-xs"><Send className="h-3 w-3" /> Reach Out</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
