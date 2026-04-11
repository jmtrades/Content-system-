// ============================================================================
// Comment Engine - Community Engagement & Comment Management
// ============================================================================
// Processes incoming comments, classifies sentiment, generates on-brand
// responses, flags potential customers, and manages DM conversations.
// ============================================================================

import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Inline Types
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  platform: string;
  post_id: string;
  comment_id: string;
  author_handle: string;
  author_name: string;
  content: string;
  sentiment: string | null;
  requires_response: boolean;
  response_text: string | null;
  responded: boolean;
  responded_at: string | null;
  is_potential_customer: boolean;
  created_at: string;
}

interface CommentClassification {
  sentiment: 'positive' | 'negative' | 'neutral' | 'question';
  requires_response: boolean;
  buying_intent: boolean;
  suggested_action: 'reply' | 'like' | 'ignore' | 'dm';
}

interface DMConversationRow {
  id: string;
  platform: string;
  user_handle: string;
  user_name: string;
  status: string;
  last_message_at: string;
  is_potential_customer: boolean;
  notes: string;
  created_at: string;
}

interface CommentStats {
  total: number;
  by_sentiment: Record<string, number>;
  by_platform: Record<string, number>;
  responded: number;
  unresponded: number;
  potential_customers: number;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(fn: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [comment-engine:${fn}] ${message}`);
}

function logError(fn: string, message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [comment-engine:${fn}] ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// classifyComment
// ---------------------------------------------------------------------------

export async function classifyComment(content: string): Promise<CommentClassification> {
  const ollama = getOllama();

  const prompt = `You are a social media comment classifier. Analyze the following comment and return a JSON object with these fields:
- "sentiment": one of "positive", "negative", "neutral", "question"
- "requires_response": boolean, true if the comment asks a question, reports a problem, or requests engagement
- "buying_intent": boolean, true if the commenter expresses interest in purchasing, pricing, or product details
- "suggested_action": one of "reply", "like", "ignore", "dm"

Comment: "${content}"

Respond ONLY with valid JSON. No markdown, no explanation.`;

  try {
    const result = await ollama.generateJSON<CommentClassification>('mistral', prompt, {
      temperature: 0.2,
      max_tokens: 200,
    });

    // Validate and normalize the result
    const validSentiments = ['positive', 'negative', 'neutral', 'question'];
    const validActions = ['reply', 'like', 'ignore', 'dm'];

    return {
      sentiment: validSentiments.includes(result.sentiment) ? result.sentiment : 'neutral',
      requires_response: Boolean(result.requires_response),
      buying_intent: Boolean(result.buying_intent),
      suggested_action: validActions.includes(result.suggested_action) ? result.suggested_action : 'ignore',
    } as CommentClassification;
  } catch (err) {
    logError('classifyComment', `Failed to classify comment: "${content.substring(0, 60)}..."`, err);
    return {
      sentiment: 'neutral',
      requires_response: false,
      buying_intent: false,
      suggested_action: 'ignore',
    };
  }
}

// ---------------------------------------------------------------------------
// generateCommentResponse
// ---------------------------------------------------------------------------

export async function generateCommentResponse(
  comment: { content: string; author_handle: string; platform: string },
  classification: { sentiment: string },
): Promise<string> {
  const ollama = getOllama();

  const toneGuide =
    classification.sentiment === 'negative'
      ? 'Be empathetic, acknowledge their concern, and offer help.'
      : classification.sentiment === 'question'
        ? 'Be helpful and informative. Answer the question directly.'
        : 'Be friendly, grateful, and encourage continued engagement.';

  const prompt = `You are a friendly, knowledgeable AI/tech content creator responding to a comment on ${comment.platform}.

Tone: ${toneGuide}
Keep it conversational, natural, and under 280 characters.
Do NOT use excessive emojis. One emoji max.
Address them naturally -- do not use their full handle unless it fits.

Their comment: "${comment.content}"
Their handle: @${comment.author_handle}

Write ONLY the response text. No quotes, no prefix, no explanation.`;

  try {
    const response = await ollama.generate('mistral', prompt, {
      temperature: 0.7,
      max_tokens: 150,
    });

    return response.trim();
  } catch (err) {
    logError('generateCommentResponse', `Failed to generate response for @${comment.author_handle}`, err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// processComments
// ---------------------------------------------------------------------------

export async function processComments(): Promise<{ processed: number; responded: number }> {
  log('processComments', 'Starting comment processing cycle');

  const db = getDb();
  let processedCount = 0;
  let respondedCount = 0;

  try {
    const { data: comments, error } = await db
      .from('comments')
      .select('*')
      .eq('responded', false)
      .order('created_at', { ascending: true })
      .limit(30);

    if (error) {
      logError('processComments', 'Failed to fetch unprocessed comments', error);
      return { processed: 0, responded: 0 };
    }

    if (!comments || comments.length === 0) {
      log('processComments', 'No unprocessed comments found');
      return { processed: 0, responded: 0 };
    }

    log('processComments', `Found ${comments.length} unprocessed comments`);

    for (const comment of comments as CommentRow[]) {
      try {
        // Classify the comment
        const classification = await classifyComment(comment.content);

        const updatePayload: Record<string, unknown> = {
          sentiment: classification.sentiment,
          requires_response: classification.requires_response,
          is_potential_customer: classification.buying_intent,
        };

        // Generate a response if needed
        if (classification.requires_response || classification.suggested_action === 'reply') {
          const responseText = await generateCommentResponse(
            {
              content: comment.content,
              author_handle: comment.author_handle,
              platform: comment.platform,
            },
            { sentiment: classification.sentiment },
          );

          if (responseText) {
            updatePayload.response_text = responseText;
            updatePayload.responded = true;
            updatePayload.responded_at = new Date().toISOString();
            respondedCount++;
          }
        } else {
          // Mark as responded (no response needed)
          updatePayload.responded = true;
          updatePayload.responded_at = new Date().toISOString();
        }

        const { error: updateErr } = await db
          .from('comments')
          .update(updatePayload)
          .eq('id', comment.id);

        if (updateErr) {
          logError('processComments', `Failed to update comment ${comment.id}`, updateErr);
        } else {
          processedCount++;
        }
      } catch (err) {
        logError('processComments', `Error processing comment ${comment.id}`, err);
      }
    }

    log('processComments', `Cycle complete: ${processedCount} processed, ${respondedCount} responses generated`);
  } catch (err) {
    logError('processComments', 'Unexpected error in processing cycle', err);
  }

  return { processed: processedCount, responded: respondedCount };
}

// ---------------------------------------------------------------------------
// flagPotentialCustomers
// ---------------------------------------------------------------------------

export async function flagPotentialCustomers(): Promise<CommentRow[]> {
  log('flagPotentialCustomers', 'Querying potential customers from comments');

  const db = getDb();

  try {
    const { data, error } = await db
      .from('comments')
      .select('*')
      .eq('is_potential_customer', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logError('flagPotentialCustomers', 'Failed to fetch potential customers', error);
      return [];
    }

    const customers = (data ?? []) as CommentRow[];
    log('flagPotentialCustomers', `Found ${customers.length} potential customers`);
    return customers;
  } catch (err) {
    logError('flagPotentialCustomers', 'Unexpected error', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// processDMs
// ---------------------------------------------------------------------------

export async function processDMs(): Promise<{ processed: number; suggestions: number }> {
  log('processDMs', 'Processing open DM conversations');

  const db = getDb();
  const ollama = getOllama();
  let processedCount = 0;
  let suggestionCount = 0;

  try {
    const { data: conversations, error } = await db
      .from('dm_conversations')
      .select('*')
      .eq('status', 'open')
      .order('last_message_at', { ascending: true })
      .limit(15);

    if (error) {
      logError('processDMs', 'Failed to fetch open DM conversations', error);
      return { processed: 0, suggestions: 0 };
    }

    if (!conversations || conversations.length === 0) {
      log('processDMs', 'No open DM conversations');
      return { processed: 0, suggestions: 0 };
    }

    log('processDMs', `Found ${conversations.length} open DM conversations`);

    for (const dm of conversations as DMConversationRow[]) {
      try {
        const prompt = `You are triaging a DM conversation on ${dm.platform}.
User: @${dm.user_handle} (${dm.user_name})
Notes so far: ${dm.notes || 'None'}

Classify this DM and return JSON with:
- "intent": one of "support", "purchase_inquiry", "collaboration", "spam", "general"
- "is_potential_customer": boolean
- "priority": one of "low", "medium", "high"
- "suggested_response": a brief, helpful response (under 200 chars)

Respond ONLY with valid JSON.`;

        const result = await ollama.generateJSON<{
          intent: string;
          is_potential_customer: boolean;
          priority: string;
          suggested_response: string;
        }>('mistral', prompt, { temperature: 0.3, max_tokens: 300 });

        const updatePayload: Record<string, unknown> = {
          is_potential_customer: Boolean(result.is_potential_customer),
          notes: `[Auto-classified] Intent: ${result.intent}, Priority: ${result.priority}. Suggested: ${result.suggested_response}`,
        };

        if (result.intent === 'spam') {
          updatePayload.status = 'spam';
        }

        const { error: updateErr } = await db
          .from('dm_conversations')
          .update(updatePayload)
          .eq('id', dm.id);

        if (updateErr) {
          logError('processDMs', `Failed to update DM ${dm.id}`, updateErr);
        } else {
          processedCount++;
          if (result.suggested_response) suggestionCount++;
        }
      } catch (err) {
        logError('processDMs', `Error processing DM ${dm.id}`, err);
      }
    }

    log('processDMs', `Cycle complete: ${processedCount} processed, ${suggestionCount} suggestions generated`);
  } catch (err) {
    logError('processDMs', 'Unexpected error in DM processing', err);
  }

  return { processed: processedCount, suggestions: suggestionCount };
}

// ---------------------------------------------------------------------------
// getCommentStats
// ---------------------------------------------------------------------------

export async function getCommentStats(): Promise<CommentStats> {
  log('getCommentStats', 'Gathering comment statistics');

  const db = getDb();

  const stats: CommentStats = {
    total: 0,
    by_sentiment: {},
    by_platform: {},
    responded: 0,
    unresponded: 0,
    potential_customers: 0,
  };

  try {
    // Fetch all comments for aggregation
    const { data: comments, error } = await db
      .from('comments')
      .select('id, sentiment, platform, responded, is_potential_customer');

    if (error) {
      logError('getCommentStats', 'Failed to fetch comments for stats', error);
      return stats;
    }

    if (!comments || comments.length === 0) {
      return stats;
    }

    stats.total = comments.length;

    for (const c of comments) {
      // Sentiment counts
      const sentiment = c.sentiment ?? 'unclassified';
      stats.by_sentiment[sentiment] = (stats.by_sentiment[sentiment] ?? 0) + 1;

      // Platform counts
      const platform = c.platform ?? 'unknown';
      stats.by_platform[platform] = (stats.by_platform[platform] ?? 0) + 1;

      // Responded vs unresponded
      if (c.responded) {
        stats.responded++;
      } else {
        stats.unresponded++;
      }

      // Potential customers
      if (c.is_potential_customer) {
        stats.potential_customers++;
      }
    }

    log('getCommentStats', `Stats: ${stats.total} total, ${stats.responded} responded, ${stats.potential_customers} potential customers`);
  } catch (err) {
    logError('getCommentStats', 'Unexpected error', err);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// batchClassify
// ---------------------------------------------------------------------------

export async function batchClassify(
  comments: { id: string; content: string }[],
): Promise<{ id: string; classification: CommentClassification }[]> {
  log('batchClassify', `Batch classifying ${comments.length} comments`);

  const results: { id: string; classification: CommentClassification }[] = [];

  // Process in chunks of 5 to avoid overwhelming Ollama
  const CHUNK_SIZE = 5;

  for (let i = 0; i < comments.length; i += CHUNK_SIZE) {
    const chunk = comments.slice(i, i + CHUNK_SIZE);

    const chunkResults = await Promise.allSettled(
      chunk.map(async (comment) => {
        const classification = await classifyComment(comment.content);
        return { id: comment.id, classification };
      }),
    );

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logError('batchClassify', 'Failed to classify a comment in batch', result.reason);
      }
    }

    log('batchClassify', `Processed chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(comments.length / CHUNK_SIZE)}`);
  }

  // Persist classifications to the database
  const db = getDb();
  for (const item of results) {
    try {
      const { error } = await db
        .from('comments')
        .update({
          sentiment: item.classification.sentiment,
          requires_response: item.classification.requires_response,
          is_potential_customer: item.classification.buying_intent,
        })
        .eq('id', item.id);

      if (error) {
        logError('batchClassify', `Failed to persist classification for comment ${item.id}`, error);
      }
    } catch (err) {
      logError('batchClassify', `Error persisting classification for ${item.id}`, err);
    }
  }

  log('batchClassify', `Batch classification complete: ${results.length}/${comments.length} classified`);
  return results;
}
