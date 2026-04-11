// ============================================================================
// Scraper Utilities - Shared helpers for all scrapers
// ============================================================================

import type { RadarItemCategory, Source } from '@/types';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export const logger = {
  info: (scraper: string, message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${scraper}] INFO: ${message}`, data ?? '');
  },
  warn: (scraper: string, message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${scraper}] WARN: ${message}`, data ?? '');
  },
  error: (scraper: string, message: string, error?: unknown) => {
    const timestamp = new Date().toISOString();
    const errMsg = error instanceof Error ? error.message : String(error ?? '');
    console.error(`[${timestamp}] [${scraper}] ERROR: ${message}`, errMsg);
  },
};

// ---------------------------------------------------------------------------
// Radar Item Shape (what every scraper returns)
// ---------------------------------------------------------------------------

export interface ScrapedItem {
  source: Source;
  source_url: string;
  title: string;
  summary: string;
  category: RadarItemCategory;
  importance_score: number;
  raw_data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Retry with Exponential Backoff
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        logger.warn('retry', `${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private lastRequestTime = 0;

  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Fetch with retry + rate limit
// ---------------------------------------------------------------------------

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  label: string = 'fetch',
  rateLimiter?: RateLimiter,
): Promise<Response> {
  if (rateLimiter) {
    await rateLimiter.wait();
  }

  return withRetry(async () => {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'ContentEmpire/1.0 (research bot)',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    return response;
  }, label);
}

// ---------------------------------------------------------------------------
// AI Keyword Detection
// ---------------------------------------------------------------------------

const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'neural network', 'llm', 'large language model', 'gpt', 'chatgpt',
  'openai', 'anthropic', 'claude', 'gemini', 'mistral', 'llama',
  'transformer', 'diffusion', 'stable diffusion', 'midjourney',
  'generative ai', 'gen ai', 'agi', 'nlp', 'natural language',
  'computer vision', 'reinforcement learning', 'fine-tuning', 'fine tuning',
  'rag', 'retrieval augmented', 'embedding', 'vector database',
  'hugging face', 'huggingface', 'pytorch', 'tensorflow',
  'langchain', 'autogen', 'crewai', 'agent', 'ai agent',
  'multimodal', 'text-to-image', 'text-to-video', 'text-to-speech',
  'speech-to-text', 'copilot', 'cursor', 'code generation',
  'prompt engineering', 'prompt', 'inference', 'model training',
  'ollama', 'local ai', 'open source ai', 'open-source model',
  'benchmark', 'mmlu', 'reasoning', 'chain of thought',
  'comfyui', 'automatic1111', 'lora', 'qlora', 'quantization',
  'robot', 'robotics', 'autonomous', 'self-driving',
  'deepfake', 'synthetic', 'alignment', 'safety',
];

export function isAIRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some(keyword => {
    // Match whole words / phrases to avoid false positives
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(lower);
  });
}

// ---------------------------------------------------------------------------
// Category Detection
// ---------------------------------------------------------------------------

export function detectCategory(text: string): RadarItemCategory {
  const lower = text.toLowerCase();

  if (/launch|released|announcing|introduces|now available|ships|debuts/i.test(lower)) {
    return 'product_launch';
  }
  if (/paper|arxiv|research|study|findings|abstract|methodology/i.test(lower)) {
    return 'research_paper';
  }
  if (/funding|raised|series [a-z]|valuation|investment|vc|venture/i.test(lower)) {
    return 'funding';
  }
  if (/open.?source|github|repository|mit license|apache/i.test(lower)) {
    return 'open_source';
  }
  if (/regulation|law|policy|ban|eu ai act|executive order|compliance/i.test(lower)) {
    return 'regulation';
  }
  if (/tutorial|how to|guide|walkthrough|step.by.step|learn/i.test(lower)) {
    return 'tutorial';
  }
  if (/opinion|think|believe|hot take|controversial|debate/i.test(lower)) {
    return 'opinion';
  }
  if (/update|upgrade|version|v\d|patch|changelog|release notes/i.test(lower)) {
    return 'tool_update';
  }
  if (/breakthrough|state.of.the.art|sota|record|surpass|beats/i.test(lower)) {
    return 'breakthrough';
  }
  if (/drama|controversy|fired|lawsuit|backlash|scandal/i.test(lower)) {
    return 'drama';
  }
  if (/hiring|job|career|we.re looking|join our team/i.test(lower)) {
    return 'hiring';
  }
  if (/acqui|merger|buyout|bought by/i.test(lower)) {
    return 'acquisition';
  }

  return 'industry_news';
}

// ---------------------------------------------------------------------------
// Importance Score Estimation
// ---------------------------------------------------------------------------

export function estimateImportance(metrics: {
  score?: number;
  comments?: number;
  stars?: number;
  votes?: number;
  views?: number;
}): number {
  // Normalize to 0-100 scale
  let importance = 30; // base

  if (metrics.score !== undefined) {
    if (metrics.score > 1000) importance += 30;
    else if (metrics.score > 500) importance += 20;
    else if (metrics.score > 100) importance += 10;
  }

  if (metrics.comments !== undefined) {
    if (metrics.comments > 500) importance += 20;
    else if (metrics.comments > 100) importance += 15;
    else if (metrics.comments > 50) importance += 10;
    else if (metrics.comments > 10) importance += 5;
  }

  if (metrics.stars !== undefined) {
    if (metrics.stars > 10000) importance += 30;
    else if (metrics.stars > 1000) importance += 20;
    else if (metrics.stars > 100) importance += 10;
  }

  if (metrics.votes !== undefined) {
    if (metrics.votes > 500) importance += 20;
    else if (metrics.votes > 100) importance += 10;
  }

  return Math.min(100, importance);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '...';
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
