// ============================================================================
// Comment Engine - Community engagement & comment management
// ============================================================================

import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Interfaces
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

interface CommentInput {
  content: string;
  author_handle: string;
  platform: string;
}

interface ClassificationInput {
  sentiment: string;
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

interface DMSuggestion {
  conversation_id: string;
  user_handle: string;
  platform: string;
  intent: string;
  suggested_response: string;
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

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [comment-engine] ${message}`);
}

function logError(message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [comment-engine] ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// classifyComment
// ---------------------------------------------------------------------------

export async function classifyComment(content: string): Promise<CommentClassification> {
  const ollama = getOllama();

  const prompt = `You are a social media comment classifier for an AI content creator brand.

Classify the following comment and return JSON with these fields:
- sentiment: one of "positive", "negative", "neutral", "question"
- requires_response: boolean - true if the comment asks a question, reports a problem, requests info, or is a meaningful compliment worth acknowledging
- buying_intent: boolean - true if the commenter mentions wanting to buy, pricing, availability, signing up, or shows purchase-related interest
- suggested_action: one of "reply", "like", "ignore", "dm"
  - "reply" if it needs a public response
  - "like" if it's a simple positive comment (e.g. "great video!")
  - "ignore" if it's spam, off-topic, or trolling
  - "dm" if the commenter has buying intent or a sensitive issue

Comment: "${content}"

Respond ONLY with valid JSON.`;

  try {
    const result = await ollama.generateJSON<CommentClassification>('mistral', prompt, {
      temperature: 0.2,
      max_tokens: 256,
    });

    // Validate and normalize the result
    const validSentiments = ['positive', 'negative', 'neutral', 'question'];
    const validActions = ['reply', 'like', 'ignore', 'dm'];

    return {
      sentiment: validSentiments.includes(result.sentiment) ? result.sentiment : 'neutral',
      requires_response: Boolean(result.requires_response),
      buying_intent: Boolean(result.buying_intent),
      suggested_action: validActions.includes(result.suggested_action) ? result.suggested_action : 'like',
    } as CommentClassification;
  } catch (err) {
    logError('Failed to classify comment', err);
    return {
      sentiment: 'neutral',
      requires_response: false,
      buying_intent: false,
      suggested_action: 'like',
    };
  }
}

// ---------------------------------------------------------------------------
// generateCommentResponse
// ---------------------------------------------------------------------------

export async function generateCommentResponse(
  comment: CommentInput,
  classification: ClassificationInput,
): Promise<string> {
  const ollama = getOllama();

  const prompt = `You are a friendly, knowledgeable AI content creator responding to a comment on your ${comment.platform} post.

Your brand voice is:
- Approachable but authoritative
- Concise (1-3 sentences max)
- Helpful and encouraging
- Never salesy or pushy
- Uses casual language but stays professional

The comment was classified as: ${classification.sentiment}
Comment by @${comment.author_handle}: "${comment.content}"

Write a natural, on-brand response. Do NOT use hashtags. Do NOT start with "Hey" or "Hi" every time - vary your openings. Keep it short and genuine.`;

  try {
    const response = await ollama.generate('mistral', prompt, {
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.trim();
  } catch (err) {
    logError(`Failed to generate response for comment by @${comment.author_handle}`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// processComments
// ---------------------------------------------------------------------------

export async function processComments(): Promise<{
  processed: number;
  responded: number;
  errors: number;
}> {
  log('Starting comment processing...');
  const db = getDb();

  const { data: comments, error } = await db
    .from('comments')
    .select('*')
    .eq('responded', false)
    .order('created_at', { ascending: true })
    .limit(30);

  if (error) {
    logError('Failed to fetch unprocessed comments', error);
    return { processed: 0, responded: 0, errors: 1 };
  }

  if (!comments || comments.length === 0) {
    log('No unprocessed comments found');
    return { processed: 0, responded: 0, errors: 0 };
  }

  log(`Found ${comments.length} unprocessed comments`);

  let processed = 0;
  let responded = 0;
  let errors = 0;

  for (const comment of comments as CommentRow[]) {
    try {
      // Step 1: Classify the comment
      const classification = await classifyComment(comment.content);

      // Step 2: Build the update payload
      const updatePayload: Record<string, unknown> = {
        sentiment: classification.sentiment,
        requires_response: classification.requires_response,
        is_potential_customer: classification.buying_intent,
      };

      // Step 3: Generate a response if needed
      if (classification.requires_response && classification.suggested_action === 'reply') {
        try {
          const responseText = await generateCommentResponse(
            {
              content: comment.content,
              author_handle: comment.author_handle,
              platform: comment.platform,
            },
            { sentiment: classification.sentiment },
          );

          updatePayload.response_text = responseText;
          updatePayload.responded = true;
          updatePayload.responded_at = new Date().toISOString();
          responded++;
        } catch {
          // Response generation failed, but classification succeeded
          logError(`Response generation failed for comment ${comment.id}`, 'skipping response');
        }
      } else if (classification.suggested_action === 'like' || classification.suggested_action === 'ignore') {
        // Mark as handled even if no response text is needed
        updatePayload.responded = true;
        updatePayload.responded_at = new Date().toISOString();
      }

      // Step 4: Persist classification + response
      const { error: updateError } = await db
        .from('comments')
        .update(updatePayload)
        .eq('id', comment.id);

      if (updateError) {
        logError(`Failed to update comment ${comment.id}`, updateError);
        errors++;
      } else {
        processed++;
      }
    } catch (err) {
      logError(`Error processing comment ${comment.id}`, err);
      errors++;
    }
  }

  log(`Processing complete: ${processed} processed, ${responded} responded, ${errors} errors`);
  return { processed, responded, errors };
}

// ---------------------------------------------------------------------------
// flagPotentialCustomers
// ---------------------------------------------------------------------------

export async function flagPotentialCustomers(): Promise<CommentRow[]> {
  log('Fetching potential customers from comments...');
  const db = getDb();

  const { data, error } = await db
    .from('comments')
    .select('*')
    .eq('is_potential_customer', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    logError('Failed to fetch potential customers', error);
    return [];
  }

  const customers = (data ?? []) as CommentRow[];
  log(`Found ${customers.length} potential customers`);
  return customers;
}

// ---------------------------------------------------------------------------
// processDMs
// ---------------------------------------------------------------------------

export async function processDMs(): Promise<DMSuggestion[]> {
  log('Processing open DM conversations...');
  const db = getDb();
  const ollama = getOllama();

  const { data: conversations, error } = await db
    .from('dm_conversations')
    .select('*')
    .eq('status', 'open')
    .order('last_message_at', { ascending: true })
    .limit(15);

  if (error) {
    logError('Failed to fetch open DM conversations', error);
    return [];
  }

  if (!conversations || conversations.length === 0) {
    log('No open DM conversations');
    return [];
  }

  log(`Processing ${conversations.length} open DM conversations`);
  const suggestions: DMSuggestion[] = [];

  for (const convo of conversations as DMConversationRow[]) {
    try {
      const prompt = `You are an AI content creator brand assistant. Classify the intent of this DM conversation and suggest a response.

User: @${convo.user_handle} (${convo.user_name})
Platform: ${convo.platform}
Notes: ${convo.notes || 'No prior notes'}

Return JSON with:
- intent: one of "question", "collaboration", "purchase_interest", "feedback", "support", "spam", "general"
- suggested_response: a brief, helpful response (1-3 sentences)
- priority: one of "high", "medium", "low"

Respond ONLY with valid JSON.`;

      const result = await ollama.generateJSON<{
        intent: string;
        suggested_response: string;
        priority: string;
      }>('mistral', prompt, {
        temperature: 0.3,
        max_tokens: 300,
      });

      suggestions.push({
        conversation_id: convo.id,
        user_handle: convo.user_handle,
        platform: convo.platform,
        intent: result.intent || 'general',
        suggested_response: result.suggested_response || '',
      });

      // Update the conversation with notes about classification
      const updatedNotes = `${convo.notes || ''}\n[auto] Intent: ${result.intent}, Priority: ${result.priority}`.trim();
      await db
        .from('dm_conversations')
        .update({
          notes: updatedNotes,
          is_potential_customer: result.intent === 'purchase_interest',
        })
        .eq('id', convo.id);
    } catch (err) {
      logError(`Failed to process DM conversation ${convo.id}`, err);
    }
  }

  log(`Generated ${suggestions.length} DM response suggestions`);
  return suggestions;
}

// ---------------------------------------------------------------------------
// getCommentStats
// ---------------------------------------------------------------------------

export async function getCommentStats(): Promise<CommentStats> {
  log('Calculating comment stats...');
  const db = getDb();

  const { data: allComments, error } = await db
    .from('comments')
    .select('id, sentiment, platform, responded, is_potential_customer');

  if (error) {
    logError('Failed to fetch comments for stats', error);
    return {
      total: 0,
      by_sentiment: {},
      by_platform: {},
      responded: 0,
      unresponded: 0,
      potential_customers: 0,
    };
  }

  const comments = (allComments ?? []) as Array<{
    id: string;
    sentiment: string | null;
    platform: string;
    responded: boolean;
    is_potential_customer: boolean;
  }>;

  const by_sentiment: Record<string, number> = {};
  const by_platform: Record<string, number> = {};
  let respondedCount = 0;
  let unrespondedCount = 0;
  let potentialCustomers = 0;

  for (const c of comments) {
    const sentiment = c.sentiment ?? 'unclassified';
    by_sentiment[sentiment] = (by_sentiment[sentiment] ?? 0) + 1;

    by_platform[c.platform] = (by_platform[c.platform] ?? 0) + 1;

    if (c.responded) {
      respondedCount++;
    } else {
      unrespondedCount++;
    }

    if (c.is_potential_customer) {
      potentialCustomers++;
    }
  }

  const stats: CommentStats = {
    total: comments.length,
    by_sentiment,
    by_platform,
    responded: respondedCount,
    unresponded: unrespondedCount,
    potential_customers: potentialCustomers,
  };

  log(`Stats: ${stats.total} total, ${stats.responded} responded, ${stats.potential_customers} potential customers`);
  return stats;
}

// ---------------------------------------------------------------------------
// batchClassify
// ---------------------------------------------------------------------------

export async function batchClassify(
  comments: { id: string; content: string }[],
): Promise<Map<string, CommentClassification>> {
  log(`Batch classifying ${comments.length} comments...`);

  const results = new Map<string, CommentClassification>();

  if (comments.length === 0) {
    return results;
  }

  // Process in chunks of 5 to avoid overloading Ollama
  const CHUNK_SIZE = 5;

  for (let i = 0; i < comments.length; i += CHUNK_SIZE) {
    const chunk = comments.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(comments.length / CHUNK_SIZE);

    log(`Processing chunk ${chunkIndex}/${totalChunks} (${chunk.length} comments)`);

    const chunkPromises = chunk.map(async (comment) => {
      try {
        const classification = await classifyComment(comment.content);
        results.set(comment.id, classification);
      } catch (err) {
        logError(`Failed to classify comment ${comment.id}`, err);
        results.set(comment.id, {
          sentiment: 'neutral',
          requires_response: false,
          buying_intent: false,
          suggested_action: 'like',
        });
      }
    });

    await Promise.all(chunkPromises);
  }

  log(`Batch classification complete: ${results.size} comments classified`);
  return results;
}
