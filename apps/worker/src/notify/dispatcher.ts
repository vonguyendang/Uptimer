import pLimit from 'p-limit';
import type {
  WebhookChannelConfig,
  EmailChannelConfig,
} from '@uptimer/db';
import { dispatchWebhookToChannel } from './webhook';

import { dispatchEmailToChannel } from './email';

export type AnyNotificationChannel =
  | { id: number; name: string; type: 'webhook'; config: WebhookChannelConfig }
  | { id: number; name: string; type: 'email'; config: EmailChannelConfig };

const DISPATCH_CONCURRENCY = 5;

export async function dispatchNotificationToChannel(args: {
  db: D1Database;
  env: Record<string, unknown>;
  channel: AnyNotificationChannel;
  eventType: string;
  eventKey: string;
  payload: unknown;
}): Promise<'sent' | 'skipped'> {
  switch (args.channel.type) {
    case 'webhook':
      return dispatchWebhookToChannel({
        db: args.db,
        env: args.env,
        channel: args.channel,
        eventType: args.eventType,
        eventKey: args.eventKey,
        payload: args.payload,
      });

    case 'email':
      return dispatchEmailToChannel({
        db: args.db,
        channel: args.channel,
        eventType: args.eventType,
        eventKey: args.eventKey,
        payload: args.payload,
      });
    default:
      throw new Error(`Unsupported notification channel type: ${(args.channel as { type: string }).type}`);
  }
}

export async function dispatchNotificationsToChannels(args: {
  db: D1Database;
  env: Record<string, unknown>;
  channels: AnyNotificationChannel[];
  eventType: string;
  eventKey: string;
  payload: unknown;
}): Promise<void> {
  if (args.channels.length === 0) return;

  const limit = pLimit(DISPATCH_CONCURRENCY);
  const settled = await Promise.allSettled(
    args.channels.map((channel) =>
      limit(() =>
        dispatchNotificationToChannel({
          db: args.db,
          env: args.env,
          channel,
          eventType: args.eventType,
          eventKey: args.eventKey,
          payload: args.payload,
        }).catch((err) => Promise.reject({ channel, err })),
      ),
    ),
  );

  const rejected = settled.filter((r) => r.status === 'rejected');
  if (rejected.length > 0) {
    const firstReason = (rejected[0] as PromiseRejectedResult).reason;
    const errorObj = firstReason && typeof firstReason === 'object' && 'err' in firstReason
      ? firstReason.err
      : firstReason;
    
    const finalError = errorObj instanceof Error ? errorObj : new Error(String(errorObj));
    throw finalError;
  }
}
