// ============================================================================
// Notification Engine — Real-time multi-channel notification system
// ============================================================================

import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationChannel = 'dashboard' | 'telegram' | 'discord' | 'email';
type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
type NotificationCategory =
  | 'breaking_news'
  | 'milestone'
  | 'revenue'
  | 'viral_content'
  | 'competitor_alert'
  | 'system_error'
  | 'trend_alert'
  | 'optimization'
  | 'engagement_spike'
  | 'content_ready';

interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channels_sent: NotificationChannel[];
  read: boolean;
  action_url: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

interface NotificationPreferences {
  channels_enabled: NotificationChannel[];
  telegram_chat_id: string | null;
  telegram_bot_token: string | null;
  discord_webhook_url: string | null;
  email_to: string | null;
  email_smtp_host: string | null;
  email_smtp_port: number;
  email_smtp_user: string | null;
  email_smtp_pass: string | null;
  email_from: string | null;
  quiet_hours_start: number | null; // 0-23
  quiet_hours_end: number | null;   // 0-23
  min_priority: NotificationPriority;
  category_overrides: Partial<Record<NotificationCategory, {
    channels: NotificationChannel[];
    min_priority: NotificationPriority;
  }>>;
}

interface NotificationConfig {
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  data?: Record<string, unknown>;
  actionUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const MILESTONE_THRESHOLDS = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

const PRIORITY_EMOJI: Record<NotificationPriority, string> = {
  critical: '🚨',
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

const CATEGORY_EMOJI: Record<NotificationCategory, string> = {
  breaking_news: '📰',
  milestone: '🏆',
  revenue: '💰',
  viral_content: '🔥',
  competitor_alert: '👀',
  system_error: '⚠️',
  trend_alert: '📈',
  optimization: '⚙️',
  engagement_spike: '💬',
  content_ready: '✅',
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  channels_enabled: ['dashboard'],
  telegram_chat_id: null,
  telegram_bot_token: null,
  discord_webhook_url: null,
  email_to: null,
  email_smtp_host: null,
  email_smtp_port: 587,
  email_smtp_user: null,
  email_smtp_pass: null,
  email_from: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  min_priority: 'low',
  category_overrides: {},
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [notification-engine] ${message}`);
}

function logError(message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [notification-engine] ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// sendNotification — Main entry point
// ---------------------------------------------------------------------------

export async function sendNotification(config: NotificationConfig): Promise<void> {
  log(`Sending notification: [${config.category}] ${config.title}`);

  const prefs = await getNotificationPreferences();

  // Check minimum priority
  if (PRIORITY_ORDER[config.priority] < PRIORITY_ORDER[prefs.min_priority]) {
    log(`Notification below minimum priority (${config.priority} < ${prefs.min_priority}), skipping`);
    return;
  }

  // Check quiet hours (skip for critical)
  if (config.priority !== 'critical' && isQuietHours(prefs)) {
    log('Quiet hours active, deferring non-critical notification to dashboard only');
    config.channels = ['dashboard'];
  }

  // Apply category overrides
  const categoryOverride = prefs.category_overrides[config.category];
  if (categoryOverride) {
    if (categoryOverride.channels) {
      config.channels = categoryOverride.channels;
    }
    if (categoryOverride.min_priority &&
        PRIORITY_ORDER[config.priority] < PRIORITY_ORDER[categoryOverride.min_priority]) {
      log(`Category override: ${config.category} requires ${categoryOverride.min_priority}, skipping`);
      return;
    }
  }

  // Filter to enabled channels
  const activeChannels = config.channels.filter(
    (ch) => prefs.channels_enabled.includes(ch),
  );

  if (activeChannels.length === 0) {
    log('No active channels for this notification, adding dashboard as fallback');
    activeChannels.push('dashboard');
  }

  const channelsSent: NotificationChannel[] = [];
  const errors: string[] = [];

  // Dispatch to each channel
  for (const channel of activeChannels) {
    try {
      switch (channel) {
        case 'dashboard':
          await sendDashboardNotification({
            id: '', // Will be generated by DB
            title: config.title,
            message: config.message,
            category: config.category,
            priority: config.priority,
            channels_sent: activeChannels,
            read: false,
            action_url: config.actionUrl ?? null,
            data: config.data ?? null,
            created_at: new Date().toISOString(),
          });
          channelsSent.push('dashboard');
          break;

        case 'telegram':
          if (prefs.telegram_bot_token && prefs.telegram_chat_id) {
            const telegramMsg = formatTelegramMessage(config);
            await sendTelegramNotification(
              prefs.telegram_chat_id,
              telegramMsg,
              prefs.telegram_bot_token,
            );
            channelsSent.push('telegram');
          } else {
            log('Telegram not configured, skipping');
          }
          break;

        case 'discord':
          if (prefs.discord_webhook_url) {
            const embed = buildDiscordEmbed(config);
            await sendDiscordNotification(
              prefs.discord_webhook_url,
              `${PRIORITY_EMOJI[config.priority]} **${config.title}**`,
              embed,
            );
            channelsSent.push('discord');
          } else {
            log('Discord webhook not configured, skipping');
          }
          break;

        case 'email':
          if (prefs.email_to && prefs.email_smtp_host) {
            const html = buildEmailHtml(config);
            await sendEmailNotification(
              prefs.email_to,
              `${PRIORITY_EMOJI[config.priority]} ${config.title}`,
              html,
              prefs,
            );
            channelsSent.push('email');
          } else {
            log('Email not configured, skipping');
          }
          break;
      }
    } catch (err) {
      logError(`Failed to send to channel: ${channel}`, err);
      errors.push(`${channel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(`Notification sent to ${channelsSent.length}/${activeChannels.length} channels: ${channelsSent.join(', ')}`);

  if (errors.length > 0) {
    log(`Channel errors: ${errors.join('; ')}`);
  }
}

// ---------------------------------------------------------------------------
// Channel implementations
// ---------------------------------------------------------------------------

async function sendTelegramNotification(
  chatId: string,
  message: string,
  botToken?: string,
): Promise<void> {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Telegram bot token not configured');
  }

  log(`Sending Telegram notification to chat ${chatId}`);

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown');
    throw new Error(`Telegram API error (${res.status}): ${body}`);
  }

  const result = (await res.json()) as { ok: boolean; description?: string };
  if (!result.ok) {
    throw new Error(`Telegram API returned ok=false: ${result.description ?? 'unknown'}`);
  }

  log('Telegram notification sent successfully');
}

async function sendDiscordNotification(
  webhookUrl: string,
  message: string,
  embed?: object,
): Promise<void> {
  log('Sending Discord notification');

  const payload: Record<string, unknown> = {
    content: message,
  };

  if (embed) {
    payload.embeds = [embed];
    // When using embeds, keep content minimal
    payload.content = undefined;
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown');
    throw new Error(`Discord webhook error (${res.status}): ${body}`);
  }

  log('Discord notification sent successfully');
}

async function sendDashboardNotification(notification: DashboardNotification): Promise<void> {
  const db = getDb();

  log('Inserting dashboard notification');

  const { error } = await db.from('notifications').insert({
    title: notification.title,
    message: notification.message,
    category: notification.category,
    priority: notification.priority,
    channels_sent: notification.channels_sent,
    read: false,
    action_url: notification.action_url,
    data: notification.data,
  });

  if (error) {
    throw new Error(`Failed to insert dashboard notification: ${error.message}`);
  }

  log('Dashboard notification stored');
}

async function sendEmailNotification(
  to: string,
  subject: string,
  html: string,
  prefs?: NotificationPreferences,
): Promise<void> {
  const smtpHost = prefs?.email_smtp_host ?? process.env.SMTP_HOST;
  const smtpPort = prefs?.email_smtp_port ?? Number(process.env.SMTP_PORT ?? '587');
  const smtpUser = prefs?.email_smtp_user ?? process.env.SMTP_USER;
  const smtpPass = prefs?.email_smtp_pass ?? process.env.SMTP_PASS;
  const from = prefs?.email_from ?? process.env.EMAIL_FROM ?? 'notifications@content-system.local';

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('Email SMTP not fully configured (need host, user, pass)');
  }

  log(`Sending email notification to ${to}`);

  // Dynamically import nodemailer to avoid hard dependency
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodemailer = require('nodemailer') as any;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    log(`Email sent to ${to}`);
  } catch (err) {
    logError('Email sending failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Message formatting helpers
// ---------------------------------------------------------------------------

function formatTelegramMessage(config: NotificationConfig): string {
  const emoji = CATEGORY_EMOJI[config.category] ?? '';
  const priorityTag = config.priority === 'critical' || config.priority === 'high'
    ? ` <b>[${config.priority.toUpperCase()}]</b>`
    : '';

  let msg = `${emoji}${priorityTag} <b>${escapeHtml(config.title)}</b>\n\n`;
  msg += escapeHtml(config.message);

  if (config.actionUrl) {
    msg += `\n\n<a href="${escapeHtml(config.actionUrl)}">View Details</a>`;
  }

  if (config.data && Object.keys(config.data).length > 0) {
    msg += '\n\n<i>Details:</i>';
    for (const [key, value] of Object.entries(config.data)) {
      msg += `\n• <b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}`;
    }
  }

  return msg;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDiscordEmbed(config: NotificationConfig): object {
  const colorMap: Record<NotificationPriority, number> = {
    critical: 0xff0000, // Red
    high: 0xff6600,     // Orange
    medium: 0xffcc00,   // Yellow
    low: 0x00cc66,      // Green
  };

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Category', value: config.category.replace(/_/g, ' '), inline: true },
    { name: 'Priority', value: config.priority.toUpperCase(), inline: true },
  ];

  if (config.data) {
    for (const [key, value] of Object.entries(config.data)) {
      fields.push({
        name: key.replace(/_/g, ' '),
        value: String(value),
        inline: true,
      });
    }
  }

  const embed: Record<string, unknown> = {
    title: `${CATEGORY_EMOJI[config.category] ?? ''} ${config.title}`,
    description: config.message,
    color: colorMap[config.priority],
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Content System Notifications' },
  };

  if (config.actionUrl) {
    embed.url = config.actionUrl;
  }

  return embed;
}

function buildEmailHtml(config: NotificationConfig): string {
  const priorityColors: Record<NotificationPriority, string> = {
    critical: '#ff0000',
    high: '#ff6600',
    medium: '#ffcc00',
    low: '#00cc66',
  };

  const color = priorityColors[config.priority];

  let dataRows = '';
  if (config.data) {
    for (const [key, value] of Object.entries(config.data)) {
      dataRows += `
        <tr>
          <td style="padding:4px 12px;font-weight:bold;color:#555;">${key.replace(/_/g, ' ')}</td>
          <td style="padding:4px 12px;">${String(value)}</td>
        </tr>`;
    }
  }

  const actionButton = config.actionUrl
    ? `<p style="margin-top:20px;">
        <a href="${config.actionUrl}"
           style="display:inline-block;padding:10px 24px;background:${color};color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;">
          View Details
        </a>
      </p>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
        <tr>
          <td style="padding:20px;background:${color};color:#fff;">
            <h1 style="margin:0;font-size:20px;">
              ${CATEGORY_EMOJI[config.category] ?? ''} ${config.title}
            </h1>
            <p style="margin:4px 0 0;font-size:12px;opacity:0.8;">
              ${config.priority.toUpperCase()} | ${config.category.replace(/_/g, ' ').toUpperCase()}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333;">
              ${config.message}
            </p>
            ${dataRows ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;">${dataRows}</table>` : ''}
            ${actionButton}
          </td>
        </tr>
        <tr>
          <td style="padding:12px 20px;background:#f9f9f9;font-size:12px;color:#999;text-align:center;">
            Content System Notification &middot; ${new Date().toISOString()}
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

// ---------------------------------------------------------------------------
// Quiet hours helper
// ---------------------------------------------------------------------------

function isQuietHours(prefs: NotificationPreferences): boolean {
  if (prefs.quiet_hours_start === null || prefs.quiet_hours_end === null) {
    return false;
  }

  const currentHour = new Date().getHours();
  const start = prefs.quiet_hours_start;
  const end = prefs.quiet_hours_end;

  // Handle overnight ranges (e.g., 22 -> 7)
  if (start <= end) {
    return currentHour >= start && currentHour < end;
  } else {
    return currentHour >= start || currentHour < end;
  }
}

// ---------------------------------------------------------------------------
// evaluateNotificationRules — Check conditions and trigger notifications
// ---------------------------------------------------------------------------

export async function evaluateNotificationRules(): Promise<void> {
  log('Evaluating notification rules...');
  const db = getDb();

  let rulesTriggered = 0;

  // Rule 1: Breaking news — Radar items with importance > 80
  try {
    const { data: radarItems, error: radarErr } = await db
      .from('radar_items')
      .select('id, title, summary, importance_score, source')
      .gt('importance_score', 80)
      .eq('processed', false)
      .order('importance_score', { ascending: false })
      .limit(10);

    if (radarErr) {
      logError('Failed to check radar items', radarErr);
    } else if (radarItems && radarItems.length > 0) {
      for (const item of radarItems) {
        await sendNotification({
          title: `Breaking: ${item.title}`,
          message: item.summary || `High-importance item detected from ${item.source} (score: ${item.importance_score})`,
          category: 'breaking_news',
          priority: item.importance_score >= 95 ? 'critical' : 'high',
          channels: ['dashboard', 'telegram', 'discord'],
          data: {
            radar_item_id: item.id,
            importance_score: item.importance_score,
            source: item.source,
          },
        });
        rulesTriggered++;
      }
    }
  } catch (err) {
    logError('Rule 1 (breaking_news) failed', err);
  }

  // Rule 2: Milestone alerts — Follower count crosses a threshold
  try {
    const { data: latestAnalytics, error: analyticsErr } = await db
      .from('daily_analytics')
      .select('platform, follower_count, date')
      .order('date', { ascending: false })
      .limit(20);

    if (analyticsErr) {
      logError('Failed to check follower milestones', analyticsErr);
    } else if (latestAnalytics && latestAnalytics.length > 0) {
      // Group by platform, get the two most recent entries per platform
      const byPlatform: Record<string, { current: number; previous: number }> = {};

      for (const row of latestAnalytics) {
        if (!byPlatform[row.platform]) {
          byPlatform[row.platform] = { current: row.follower_count, previous: 0 };
        } else if (byPlatform[row.platform].previous === 0) {
          byPlatform[row.platform].previous = row.follower_count;
        }
      }

      for (const [platform, counts] of Object.entries(byPlatform)) {
        for (const threshold of MILESTONE_THRESHOLDS) {
          if (counts.current >= threshold && counts.previous < threshold) {
            const formattedThreshold = threshold >= 1_000_000
              ? `${(threshold / 1_000_000).toFixed(0)}M`
              : threshold >= 1_000
                ? `${(threshold / 1_000).toFixed(0)}K`
                : String(threshold);

            await sendNotification({
              title: `${formattedThreshold} Followers on ${platform}!`,
              message: `You just crossed ${formattedThreshold} followers on ${platform}. Current count: ${counts.current.toLocaleString()}.`,
              category: 'milestone',
              priority: threshold >= 100_000 ? 'high' : 'medium',
              channels: ['dashboard', 'telegram', 'discord'],
              data: {
                platform,
                threshold,
                current_count: counts.current,
              },
            });
            rulesTriggered++;
          }
        }
      }
    }
  } catch (err) {
    logError('Rule 2 (milestone) failed', err);
  }

  // Rule 3: Revenue events — Recent unnotified revenue
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: recentRevenue, error: revErr } = await db
      .from('revenue_events')
      .select('id, amount, currency, type, product_id, created_at')
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false });

    if (revErr) {
      logError('Failed to check revenue events', revErr);
    } else if (recentRevenue && recentRevenue.length > 0) {
      for (const event of recentRevenue) {
        // Check if we already notified about this event
        const { data: existing } = await db
          .from('notifications')
          .select('id')
          .eq('category', 'revenue')
          .contains('data', { revenue_event_id: event.id })
          .limit(1);

        if (existing && existing.length > 0) continue;

        const amountStr = `${event.currency ?? 'USD'} ${Number(event.amount).toFixed(2)}`;

        await sendNotification({
          title: `New ${event.type === 'recurring' ? 'Recurring' : ''} Sale: ${amountStr}`,
          message: `A ${event.type} payment of ${amountStr} was received.`,
          category: 'revenue',
          priority: event.amount >= 100 ? 'high' : 'medium',
          channels: ['dashboard', 'telegram'],
          data: {
            revenue_event_id: event.id,
            amount: event.amount,
            currency: event.currency,
            type: event.type,
            product_id: event.product_id,
          },
        });
        rulesTriggered++;
      }
    }
  } catch (err) {
    logError('Rule 3 (revenue) failed', err);
  }

  // Rule 4: Viral content — Posts with views exceeding 10x average
  try {
    const { data: recentPosts, error: postsErr } = await db
      .from('post_analytics')
      .select('post_id, platform, views, engagement_rate, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsErr) {
      logError('Failed to check for viral content', postsErr);
    } else if (recentPosts && recentPosts.length > 1) {
      const totalViews = recentPosts.reduce((sum, p) => sum + (p.views ?? 0), 0);
      const avgViews = totalViews / recentPosts.length;

      if (avgViews > 0) {
        const viralThreshold = avgViews * 10;

        for (const post of recentPosts.slice(0, 10)) {
          if ((post.views ?? 0) >= viralThreshold) {
            // Check if already notified
            const { data: existing } = await db
              .from('notifications')
              .select('id')
              .eq('category', 'viral_content')
              .contains('data', { post_id: post.post_id })
              .limit(1);

            if (existing && existing.length > 0) continue;

            await sendNotification({
              title: `Viral Content Detected on ${post.platform}!`,
              message: `A post is performing ${Math.round(post.views / avgViews)}x above your average with ${post.views.toLocaleString()} views.`,
              category: 'viral_content',
              priority: 'high',
              channels: ['dashboard', 'telegram', 'discord'],
              data: {
                post_id: post.post_id,
                platform: post.platform,
                views: post.views,
                average_views: Math.round(avgViews),
                multiplier: Math.round(post.views / avgViews),
              },
            });
            rulesTriggered++;
          }
        }
      }
    }
  } catch (err) {
    logError('Rule 4 (viral_content) failed', err);
  }

  // Rule 5: Competitor alerts — Competitors posting about same topics
  try {
    const { data: competitorPosts, error: compErr } = await db
      .from('competitor_content')
      .select('id, competitor_handle, platform, topic, engagement_rate, posted_at')
      .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .gt('engagement_rate', 5.0)
      .order('engagement_rate', { ascending: false })
      .limit(5);

    if (compErr) {
      logError('Failed to check competitor alerts', compErr);
    } else if (competitorPosts && competitorPosts.length > 0) {
      for (const post of competitorPosts) {
        const { data: existing } = await db
          .from('notifications')
          .select('id')
          .eq('category', 'competitor_alert')
          .contains('data', { competitor_content_id: post.id })
          .limit(1);

        if (existing && existing.length > 0) continue;

        await sendNotification({
          title: `Competitor @${post.competitor_handle} Trending`,
          message: `@${post.competitor_handle} posted about "${post.topic ?? 'unknown topic'}" on ${post.platform} with ${post.engagement_rate.toFixed(1)}% engagement.`,
          category: 'competitor_alert',
          priority: 'medium',
          channels: ['dashboard'],
          data: {
            competitor_content_id: post.id,
            competitor_handle: post.competitor_handle,
            platform: post.platform,
            topic: post.topic,
            engagement_rate: post.engagement_rate,
          },
        });
        rulesTriggered++;
      }
    }
  } catch (err) {
    logError('Rule 5 (competitor_alert) failed', err);
  }

  log(`Notification rules evaluation complete: ${rulesTriggered} notifications triggered`);
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const db = getDb();

  try {
    const { data, error } = await db
      .from('optimizer_config')
      .select('config_value')
      .eq('config_key', 'notification_preferences')
      .single();

    if (error || !data) {
      log('No notification preferences found, using defaults');
      return { ...DEFAULT_PREFERENCES };
    }

    const stored = data.config_value as Partial<NotificationPreferences>;
    return { ...DEFAULT_PREFERENCES, ...stored };
  } catch (err) {
    logError('Failed to load notification preferences', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<void> {
  const db = getDb();

  log('Updating notification preferences');

  const current = await getNotificationPreferences();
  const merged = { ...current, ...prefs };

  const { error } = await db
    .from('optimizer_config')
    .upsert(
      {
        config_key: 'notification_preferences',
        config_value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'config_key' },
    );

  if (error) {
    throw new Error(`Failed to update notification preferences: ${error.message}`);
  }

  log('Notification preferences updated');
}

// ---------------------------------------------------------------------------
// Dashboard notification management
// ---------------------------------------------------------------------------

export async function getUnreadNotifications(limit = 50): Promise<DashboardNotification[]> {
  const db = getDb();

  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logError('Failed to fetch unread notifications', error);
    return [];
  }

  return (data ?? []) as DashboardNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const db = getDb();

  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
}

export async function markAllRead(): Promise<void> {
  const db = getDb();

  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .eq('read', false);

  if (error) {
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }

  log('All notifications marked as read');
}

// ---------------------------------------------------------------------------
// generateDailyDigest — Summary of last 24 hours
// ---------------------------------------------------------------------------

export async function generateDailyDigest(): Promise<string> {
  log('Generating daily notification digest...');
  const db = getDb();
  const ollama = getOllama();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all notifications from the last 24 hours
  const { data: recentNotifications, error: notifErr } = await db
    .from('notifications')
    .select('*')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false });

  if (notifErr) {
    logError('Failed to fetch notifications for digest', notifErr);
    return 'Failed to generate digest: could not fetch notifications.';
  }

  const notifications = (recentNotifications ?? []) as DashboardNotification[];

  if (notifications.length === 0) {
    return 'No notifications in the last 24 hours. All quiet on the content front.';
  }

  // Group by category
  const byCategory: Record<string, DashboardNotification[]> = {};
  for (const n of notifications) {
    if (!byCategory[n.category]) {
      byCategory[n.category] = [];
    }
    byCategory[n.category].push(n);
  }

  // Build a summary for the LLM
  let summaryData = `Notifications from the last 24 hours (${notifications.length} total):\n\n`;

  for (const [category, items] of Object.entries(byCategory)) {
    summaryData += `## ${category.replace(/_/g, ' ').toUpperCase()} (${items.length})\n`;
    for (const item of items.slice(0, 5)) {
      summaryData += `- ${item.title}: ${item.message}\n`;
    }
    if (items.length > 5) {
      summaryData += `- ... and ${items.length - 5} more\n`;
    }
    summaryData += '\n';
  }

  // Generate a human-friendly digest using Ollama
  const prompt = `You are a content strategist's daily briefing assistant. Write a concise daily digest from the following notification data. Group insights by importance. Use a professional but friendly tone. Keep it under 500 words. Highlight action items.

${summaryData}

Write the digest now. Start with "Daily Digest" as the heading.`;

  try {
    const digest = await ollama.generate('mistral', prompt, {
      temperature: 0.5,
      max_tokens: 800,
    });

    log('Daily digest generated successfully');
    return digest.trim();
  } catch (err) {
    logError('Failed to generate digest with LLM, falling back to raw summary', err);

    // Fallback: structured text summary
    let fallback = `Daily Digest - ${new Date().toLocaleDateString()}\n\n`;
    fallback += `Total notifications: ${notifications.length}\n\n`;

    for (const [category, items] of Object.entries(byCategory)) {
      fallback += `${category.replace(/_/g, ' ').toUpperCase()}: ${items.length}\n`;
      for (const item of items.slice(0, 3)) {
        fallback += `  - ${item.title}\n`;
      }
    }

    return fallback;
  }
}
