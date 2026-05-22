import type { EmailChannelConfig } from '@uptimer/db';
import { claimNotificationDelivery, finalizeNotificationDelivery } from './dedupe';
import { buildNotificationMessage, shouldSendEvent, renderStringTemplate } from './template';

export type EmailChannel = {
  id: number;
  name: string;
  config: EmailChannelConfig;
};

function parseEmailAddress(address: string): { email: string; name?: string } {
  const match = address.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = (match[1] || '').trim();
    const cleanedName = name.replace(/^["']|["']$/g, '').trim();
    const email = (match[2] || '').trim();
    return cleanedName ? { name: cleanedName, email } : { email };
  }
  return { email: address.trim() };
}

function defaultSubjectForEvent(eventType: string, vars: Record<string, unknown>): string {
  const getNestedString = (obj: unknown, path: string) => {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === 'string' ? cur : '';
  };

  switch (eventType) {
    case 'monitor.down': {
      const name = getNestedString(vars, 'monitor.name');
      return `[Uptimer] Monitor DOWN: ${name || 'Unknown'}`;
    }
    case 'monitor.up': {
      const name = getNestedString(vars, 'monitor.name');
      return `[Uptimer] Monitor UP: ${name || 'Unknown'}`;
    }
    case 'incident.created': {
      const title = getNestedString(vars, 'incident.title');
      return `[Uptimer] Incident: ${title || 'New Incident'}`;
    }
    case 'incident.updated': {
      const title = getNestedString(vars, 'incident.title');
      return `[Uptimer] Incident Update: ${title || 'Updated'}`;
    }
    case 'incident.resolved': {
      const title = getNestedString(vars, 'incident.title');
      return `[Uptimer] Incident Resolved: ${title || 'Resolved'}`;
    }
    case 'maintenance.started': {
      const title = getNestedString(vars, 'maintenance.title');
      return `[Uptimer] Maintenance Started: ${title || 'Maintenance'}`;
    }
    case 'maintenance.ended': {
      const title = getNestedString(vars, 'maintenance.title');
      return `[Uptimer] Maintenance Ended: ${title || 'Maintenance'}`;
    }
    case 'test.ping': {
      return '[Uptimer] Test Notification';
    }
    default:
      return '[Uptimer] Notification';
  }
}

export async function dispatchEmailToChannel(args: {
  db: D1Database;
  channel: EmailChannel;
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
  const { message, vars } = buildNotificationMessage({
    channelId: args.channel.id,
    channelName: args.channel.name,
    messageTemplate: config.message_template,
    eventType: args.eventType,
    eventKey: args.eventKey,
    payload: args.payload,
    now,
  });

  const defaultSubject = defaultSubjectForEvent(args.eventType, vars);
  const subject = config.subject_template
    ? renderStringTemplate(config.subject_template, {
        ...vars,
        subject: defaultSubject,
        default_subject: defaultSubject,
      })
    : defaultSubject;

  let outcome: { status: 'success' | 'failed'; httpStatus: number | null; error: string | null };

  try {
    if (config.provider === 'resend') {
      const toEmails = config.to.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.from,
          to: toEmails,
          subject,
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
          error: `Resend API error: HTTP ${res.status}${errText ? ` - ${errText}` : ''}`,
        };
      }
    } else if (config.provider === 'sendgrid') {
      const fromParsed = parseEmailAddress(config.from);
      const toEmails = config.to.split(',').map((s) => s.trim()).filter(Boolean);
      const personalizations = [
        {
          to: toEmails.map((email) => {
            const parsed = parseEmailAddress(email);
            return parsed.name ? { email: parsed.email, name: parsed.name } : { email: parsed.email };
          }),
        },
      ];

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations,
          from: fromParsed.name ? { email: fromParsed.email, name: fromParsed.name } : { email: fromParsed.email },
          subject,
          content: [
            {
              type: 'text/plain',
              value: message,
            },
          ],
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
          error: `SendGrid API error: HTTP ${res.status}${errText ? ` - ${errText}` : ''}`,
        };
      }
    } else {
      outcome = {
        status: 'failed',
        httpStatus: null,
        error: `Unsupported email provider: ${config.provider}`,
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
