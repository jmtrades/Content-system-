// ============================================================================
// Ollama Local LLM Client
// ============================================================================

import type { OllamaModel, OllamaGenerateOptions, OllamaResponse } from '@/types';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

const AVAILABLE_MODELS: OllamaModel[] = ['mistral', 'llama3:8b', 'phi3:mini'];

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaStreamChunk {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  context?: number[];
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  // -------------------------------------------------------------------------
  // Health & discovery
  // -------------------------------------------------------------------------

  /**
   * Verifies Ollama is reachable and running.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lists models currently available on the local Ollama instance.
   */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const body = (await res.json()) as { models?: { name: string }[] };
      return (body.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Returns the subset of AVAILABLE_MODELS that are currently pulled.
   */
  async getAvailableModels(): Promise<string[]> {
    const installed = await this.listModels();
    return AVAILABLE_MODELS.filter((m) =>
      installed.some((i) => i === m || i.startsWith(`${m}:`)),
    );
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  /**
   * Send a prompt and get back the full text response.
   */
  async generate(
    model: OllamaModel,
    prompt: string,
    options?: OllamaGenerateOptions,
  ): Promise<string> {
    const body = this.buildRequestBody(model, prompt, false, options);
    const response = await this.fetchWithRetry<OllamaResponse>(
      `${this.baseUrl}/api/generate`,
      body,
    );
    return response.response;
  }

  /**
   * Send a prompt and parse the response as JSON.
   * Automatically wraps the prompt with a JSON instruction if not already present.
   */
  async generateJSON<T = Record<string, unknown>>(
    model: OllamaModel,
    prompt: string,
    options?: OllamaGenerateOptions,
  ): Promise<T> {
    const jsonPrompt = prompt.includes('JSON')
      ? prompt
      : `${prompt}\n\nRespond ONLY with valid JSON. No markdown, no explanation.`;

    const body = this.buildRequestBody(model, jsonPrompt, false, options);

    // Ollama supports format: "json" to force JSON output
    (body as Record<string, unknown>).format = 'json';

    const response = await this.fetchWithRetry<OllamaResponse>(
      `${this.baseUrl}/api/generate`,
      body,
    );

    const text = response.response.trim();

    try {
      return JSON.parse(text) as T;
    } catch {
      // Sometimes the model wraps JSON in markdown code fences
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1]) {
        return JSON.parse(match[1].trim()) as T;
      }
      throw new Error(`Failed to parse JSON from Ollama response: ${text.slice(0, 200)}`);
    }
  }

  /**
   * Stream a generation token-by-token via an async generator.
   */
  async *streamGenerate(
    model: OllamaModel,
    prompt: string,
    options?: OllamaGenerateOptions,
  ): AsyncGenerator<string, void, undefined> {
    const body = this.buildRequestBody(model, prompt, true, options);

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`Ollama stream request failed (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('Ollama response has no body to stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;
            if (chunk.response) {
              yield chunk.response;
            }
            if (chunk.done) return;
          } catch {
            // Partial JSON line — will be completed on next read
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as OllamaStreamChunk;
          if (chunk.response) {
            yield chunk.response;
          }
        } catch {
          // Ignore trailing incomplete JSON
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // -------------------------------------------------------------------------
  // Embedding (bonus — used by some engines)
  // -------------------------------------------------------------------------

  /**
   * Generate embeddings for the given text.
   */
  async embed(model: OllamaModel, text: string): Promise<number[]> {
    const body = { model, prompt: text };
    const response = await this.fetchWithRetry<{ embedding: number[] }>(
      `${this.baseUrl}/api/embeddings`,
      body,
    );
    return response.embedding;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private buildRequestBody(
    model: OllamaModel,
    prompt: string,
    stream: boolean,
    options?: OllamaGenerateOptions,
  ): OllamaGenerateRequest {
    const body: OllamaGenerateRequest = {
      model,
      prompt,
      stream,
    };

    if (options?.system) {
      body.system = options.system;
    }

    if (options) {
      body.options = {};
      if (options.temperature !== undefined) body.options.temperature = options.temperature;
      if (options.top_p !== undefined) body.options.top_p = options.top_p;
      if (options.top_k !== undefined) body.options.top_k = options.top_k;
      if (options.max_tokens !== undefined) body.options.num_predict = options.max_tokens;
      if (options.stop !== undefined) body.options.stop = options.stop;
    }

    return body;
  }

  private async fetchWithRetry<T>(url: string, body: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'unknown error');
          throw new Error(`Ollama request failed (${res.status}): ${errText}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[ollama] Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${lastError.message}`,
        );

        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('Ollama request failed after all retries');
  }
}

// ---------------------------------------------------------------------------
// Default singleton instance
// ---------------------------------------------------------------------------

let defaultClient: OllamaClient | null = null;

export function getOllama(): OllamaClient {
  if (!defaultClient) {
    defaultClient = new OllamaClient();
  }
  return defaultClient;
}
