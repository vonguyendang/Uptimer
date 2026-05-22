import { useMemo, useState } from 'react';
import type {
  CreateNotificationChannelInput,
  NotificationChannel,
  WebhookChannelConfig,
  TelegramChannelConfig,
  EmailChannelConfig,
  AnyNotificationChannelConfig,
} from '../api/types';
import { useI18n } from '../app/I18nContext';
import {
  Button,
  FIELD_HELP_CLASS,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from './ui';

interface NotificationChannelFormProps {
  channel?: NotificationChannel | undefined;
  onSubmit: (data: CreateNotificationChannelInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | undefined;
}

const inputClass = INPUT_CLASS;
const selectClass = SELECT_CLASS;
const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

type NotificationEventType = NonNullable<WebhookChannelConfig['enabled_events']>[number];

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function toMethod(value: string): NonNullable<WebhookChannelConfig['method']> {
  switch (value) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
      return value;
    default:
      return 'POST';
  }
}

function toPayloadType(value: string): NonNullable<WebhookChannelConfig['payload_type']> {
  switch (value) {
    case 'json':
    case 'param':
    case 'x-www-form-urlencoded':
      return value;
    default:
      return 'json';
  }
}

export function NotificationChannelForm({
  channel,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: NotificationChannelFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState(channel?.name ?? '');
  const [type, setType] = useState<'webhook' | 'telegram' | 'email'>(
    channel?.type ?? 'webhook',
  );

  // Webhook States
  const isExistingWebhook = channel?.type === 'webhook';
  const webhookConfig = isExistingWebhook ? (channel.config_json as WebhookChannelConfig) : null;

  const [url, setUrl] = useState(webhookConfig?.url ?? '');
  const [method, setMethod] = useState<NonNullable<WebhookChannelConfig['method']>>(
    webhookConfig?.method ?? 'POST',
  );
  const [timeoutMs, setTimeoutMs] = useState<number>(webhookConfig?.timeout_ms ?? 5000);
  const [payloadType, setPayloadType] = useState<NonNullable<WebhookChannelConfig['payload_type']>>(
    webhookConfig?.payload_type ?? 'json',
  );
  const [headersJson, setHeadersJson] = useState(
    safeJsonStringify(webhookConfig?.headers ?? {}),
  );
  const [payloadTemplateJson, setPayloadTemplateJson] = useState(
    webhookConfig?.payload_template !== undefined
      ? safeJsonStringify(webhookConfig.payload_template)
      : '',
  );
  const [signingEnabled, setSigningEnabled] = useState<boolean>(
    webhookConfig?.signing?.enabled ?? false,
  );
  const [signingSecretRef, setSigningSecretRef] = useState<string>(
    webhookConfig?.signing?.secret_ref ?? '',
  );

  // Telegram States
  const isExistingTelegram = channel?.type === 'telegram';
  const telegramConfig = isExistingTelegram ? (channel.config_json as TelegramChannelConfig) : null;

  const [botToken, setBotToken] = useState(telegramConfig?.bot_token ?? '');
  const [chatId, setChatId] = useState(telegramConfig?.chat_id ?? '');

  // Email States
  const isExistingEmail = channel?.type === 'email';
  const emailConfig = isExistingEmail ? (channel.config_json as EmailChannelConfig) : null;

  const [emailProvider, setEmailProvider] = useState<'resend' | 'sendgrid'>(
    emailConfig?.provider ?? 'resend',
  );
  const [emailApiKey, setEmailApiKey] = useState(emailConfig?.api_key ?? '');
  const [emailFrom, setEmailFrom] = useState(emailConfig?.from ?? '');
  const [emailTo, setEmailTo] = useState(emailConfig?.to ?? '');
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState(
    emailConfig?.subject_template ?? '',
  );

  // Shared States
  const [messageTemplate, setMessageTemplate] = useState(
    channel?.config_json.message_template ?? '',
  );
  const [enabledEvents, setEnabledEvents] = useState<NotificationEventType[]>(
    channel?.config_json.enabled_events ?? [],
  );

  const headersParse = useMemo(() => {
    const trimmed = headersJson.trim();
    if (!trimmed) return { ok: true as const, value: {} as Record<string, string> };

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false as const, error: t('notification_form.error_headers_invalid_json') };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: t('notification_form.error_headers_must_object'),
      };
    }

    for (const [k, vv] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof vv !== 'string') {
        return {
          ok: false as const,
          error: t('notification_form.error_header_value_string', { key: k }),
        };
      }
    }

    return { ok: true as const, value: parsed as Record<string, string> };
  }, [headersJson, t]);

  const payloadTemplateParse = useMemo(() => {
    const trimmed = payloadTemplateJson.trim();
    if (!trimmed) return { ok: true as const, value: undefined as unknown };

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return {
        ok: false as const,
        error: t('notification_form.error_payload_template_invalid_json'),
      };
    }

    return { ok: true as const, value: parsed };
  }, [payloadTemplateJson, t]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (type === 'webhook') {
      return !!url.trim() && headersParse.ok && payloadTemplateParse.ok;
    }
    if (type === 'telegram') {
      return !!botToken.trim() && !!chatId.trim();
    }
    if (type === 'email') {
      return !!emailApiKey.trim() && !!emailFrom.trim() && !!emailTo.trim();
    }
    return false;
  }, [
    name,
    type,
    url,
    headersParse.ok,
    payloadTemplateParse.ok,
    botToken,
    chatId,
    emailApiKey,
    emailFrom,
    emailTo,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    let config: AnyNotificationChannelConfig;

    if (type === 'webhook') {
      const webhookConfig: WebhookChannelConfig = {
        url,
        method,
        timeout_ms: timeoutMs,
        payload_type: payloadType,
      };

      if (headersParse.ok && Object.keys(headersParse.value).length > 0) {
        webhookConfig.headers = headersParse.value;
      }

      if (payloadTemplateParse.ok && payloadTemplateParse.value !== undefined) {
        webhookConfig.payload_template = payloadTemplateParse.value;
      }

      if (signingEnabled) {
        webhookConfig.signing = { enabled: true, secret_ref: signingSecretRef };
      }

      config = webhookConfig;
    } else if (type === 'telegram') {
      config = {
        bot_token: botToken.trim(),
        chat_id: chatId.trim(),
      };
    } else {
      const emailConfig: EmailChannelConfig = {
        provider: emailProvider,
        api_key: emailApiKey.trim(),
        from: emailFrom.trim(),
        to: emailTo.trim(),
      };
      if (emailSubjectTemplate.trim()) {
        emailConfig.subject_template = emailSubjectTemplate.trim();
      }
      config = emailConfig;
    }

    if (messageTemplate.trim()) {
      config.message_template = messageTemplate;
    }

    if (enabledEvents.length > 0) {
      config.enabled_events = enabledEvents;
    }

    onSubmit({ name, type, config_json: config });
  };

  const toggleEnabledEvent = (ev: NotificationEventType) => {
    setEnabledEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const allEvents: NotificationEventType[] = [
    'monitor.down',
    'monitor.up',
    'incident.created',
    'incident.updated',
    'incident.resolved',
    'maintenance.started',
    'maintenance.ended',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div>
        <label className={labelClass}>{t('notification_form.name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className={labelClass}>{t('notification_form.type')}</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'webhook' | 'telegram' | 'email')}
          className={selectClass}
          disabled={!!channel}
        >
          <option value="webhook">{t('notification_form.type_webhook')}</option>
          <option value="telegram">{t('notification_form.type_telegram')}</option>
          <option value="email">{t('notification_form.type_email')}</option>
        </select>
      </div>

      {type === 'webhook' && (
        <>
          <div>
            <label className={labelClass}>{t('notification_form.webhook_url')}</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('notification_form.webhook_url_placeholder')}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.method')}</label>
            <select
              value={method}
              onChange={(e) => setMethod(toMethod(e.target.value))}
              className={selectClass}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.payload_type')}</label>
            <select
              value={payloadType}
              onChange={(e) => setPayloadType(toPayloadType(e.target.value))}
              className={selectClass}
            >
              <option value="json">{t('notification_form.payload_type_json')}</option>
              <option value="param">{t('notification_form.payload_type_query')}</option>
              <option value="x-www-form-urlencoded">
                {t('notification_form.payload_type_urlencoded')}
              </option>
            </select>
            <div className={FIELD_HELP_CLASS}>{t('notification_form.payload_type_help')}</div>
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.timeout_ms')}</label>
            <input
              type="number"
              min={1}
              max={60000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.headers_json')}</label>
            <textarea
              value={headersJson}
              onChange={(e) => setHeadersJson(e.target.value)}
              className={textareaClass}
              rows={4}
              placeholder={t('notification_form.headers_placeholder')}
            />
            {!headersParse.ok && (
              <div className="mt-1 text-xs text-red-600 dark:text-red-400">{headersParse.error}</div>
            )}
            <div className={FIELD_HELP_CLASS}>{t('notification_form.headers_help')}</div>
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.payload_template_optional')}</label>
            <textarea
              value={payloadTemplateJson}
              onChange={(e) => setPayloadTemplateJson(e.target.value)}
              className={textareaClass}
              rows={8}
              placeholder={
                payloadType === 'json'
                  ? t('notification_form.payload_template_placeholder_json')
                  : t('notification_form.payload_template_placeholder_flat')
              }
            />
            {!payloadTemplateParse.ok && (
              <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                {payloadTemplateParse.error}
              </div>
            )}
            <div className={FIELD_HELP_CLASS}>{t('notification_form.payload_template_help')}</div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={signingEnabled}
                onChange={(e) => setSigningEnabled(e.target.checked)}
              />
              <span>{t('notification_form.signing_enable')}</span>
            </label>
            {signingEnabled && (
              <div className="mt-3">
                <label className={labelClass}>{t('notification_form.signing_secret_ref')}</label>
                <input
                  type="text"
                  value={signingSecretRef}
                  onChange={(e) => setSigningSecretRef(e.target.value)}
                  className={inputClass}
                  placeholder={t('notification_form.signing_secret_ref_placeholder')}
                  required
                />
              </div>
            )}
          </div>
        </>
      )}

      {type === 'telegram' && (
        <>
          <div>
            <label className={labelClass}>{t('notification_form.telegram_bot_token')}</label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={t('notification_form.telegram_bot_token_placeholder')}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.telegram_chat_id')}</label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={t('notification_form.telegram_chat_id_placeholder')}
              className={inputClass}
              required
            />
          </div>
        </>
      )}

      {type === 'email' && (
        <>
          <div>
            <label className={labelClass}>{t('notification_form.email_provider')}</label>
            <select
              value={emailProvider}
              onChange={(e) => setEmailProvider(e.target.value as 'resend' | 'sendgrid')}
              className={selectClass}
            >
              <option value="resend">{t('notification_form.email_provider_resend')}</option>
              <option value="sendgrid">{t('notification_form.email_provider_sendgrid')}</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.email_api_key')}</label>
            <input
              type="password"
              value={emailApiKey}
              onChange={(e) => setEmailApiKey(e.target.value)}
              placeholder={t('notification_form.email_api_key_placeholder')}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.email_from')}</label>
            <input
              type="email"
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              placeholder={t('notification_form.email_from_placeholder')}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.email_to')}</label>
            <input
              type="text"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder={t('notification_form.email_to_placeholder')}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.email_subject_template')}</label>
            <input
              type="text"
              value={emailSubjectTemplate}
              onChange={(e) => setEmailSubjectTemplate(e.target.value)}
              placeholder={t('notification_form.email_subject_template_placeholder')}
              className={inputClass}
            />
            <div className={FIELD_HELP_CLASS}>{t('notification_form.email_subject_template_help')}</div>
          </div>
        </>
      )}

      <div>
        <label className={labelClass}>{t('notification_form.message_template_optional')}</label>
        <textarea
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          className={textareaClass}
          rows={3}
          placeholder={t('notification_form.message_template_placeholder')}
        />
        <div className={FIELD_HELP_CLASS}>{t('notification_form.message_template_help')}</div>
      </div>

      <div>
        <label className={labelClass}>{t('notification_form.enabled_events_optional')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {allEvents.map((ev) => (
            <label
              key={ev}
              className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
            >
              <input
                type="checkbox"
                checked={enabledEvents.includes(ev)}
                onChange={() => toggleEnabledEvent(ev)}
              />
              <span>{ev}</span>
            </label>
          ))}
        </div>
        <div className={FIELD_HELP_CLASS}>{t('notification_form.enabled_events_help')}</div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading || !canSubmit} className="flex-1">
          {isLoading ? t('common.saving') : channel ? t('common.update') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}
