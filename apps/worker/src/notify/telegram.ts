import type { TelegramChannelConfig } from '@uptimer/db';
import { claimNotificationDelivery, finalizeNotificationDelivery } from './dedupe';
import { buildNotificationMessage, shouldSendEvent } from './template';

export type TelegramChannel = {
  id: number;
  name: string;
  config: TelegramChannelConfig;
};

export async function dispatchTelegramToChannel(args: {
  db: D1Database;
  channel: TelegramChannel;
  eventType: string;
  eventKey: string;
  payload: unknown;
}): Promise<'sent' | 'skipped'> {
  if (!shouldSendEvent(args.channel.config, args.eventType)) {
    return 'skipped';
  }

  const now = Math.floor(Date.now() / 1000);
  const claimed = await claimNotificationDelivery(args.db, args.eventKey, args.channel.id, now);
  if (!claimed) {
    return 'skipped';
  }

  const config = args.channel.config;
  const { message } = buildNotificationMessage({
    channelId: args.channel.id,
    channelName: args.channel.name,
    messageTemplate: config.message_template,
    eventType: args.eventType,
    eventKey: args.eventKey,
    payload: args.payload,
    now,
  });

  const botToken = config.bot_token;
  const chatId = config.chat_id;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  let outcome: { status: 'success' | 'failed'; httpStatus: number | null; error: string | null };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
      cache: 'no-store',
    });

    if (res.ok) {
      res.body?.cancel();
      outcome = { status: 'success', httpStatus: res.status, error: null };
    } else {
      const errText = await res.text().catch(() => '');
      outcome = {
        status: 'failed',
        httpStatus: res.status,
        error: `Telegram API error: HTTP ${res.status}${errText ? ` - ${errText}` : ''}`,
      };
    }
  } catch (err) {
    outcome = {
      status: 'failed',
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await finalizeNotificationDelivery(args.db, args.eventKey, args.channel.id, outcome);
  return 'sent';
}
