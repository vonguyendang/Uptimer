const fs = require('fs');
let text = fs.readFileSync('apps/web/src/components/NotificationChannelForm.tsx', 'utf8');

function resolveConflicts(text) {
  const parts = text.split('<<<<<<< HEAD');
  let result = parts[0];
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const separatorIdx = part.indexOf('=======');
    const endIdx = part.indexOf('>>>>>>> upstream/master');
    
    const headContent = part.substring(0, separatorIdx).replace(/^\n/, '');
    const upstreamContent = part.substring(separatorIdx + 7, endIdx).replace(/^\n/, '');
    const tail = part.substring(endIdx + 23).replace(/^\n/, '');
    
    // We can conditionally merge based on snippet content.
    if (headContent.includes("const [type, setType] = useState<'webhook' | 'telegram' | 'email'>")) {
      result += `
  const [type, setType] = useState<'webhook' | 'email'>(channel?.type === 'email' ? 'email' : 'webhook');

  // Webhook States
  const [preset, setPreset] = useState<NotificationChannelPreset>(
    initialIsTelegram ? 'telegram' : 'custom',
  );
  const [url, setUrl] = useState(customConfig?.url ?? '');
  const [method, setMethod] = useState<WebhookMethod>(customConfig?.method ?? 'POST');

  const [timeoutMs, setTimeoutMs] = useState<number>(initialConfig?.timeout_ms ?? 5000);
  const [payloadType, setPayloadType] = useState<WebhookPayloadType>(
    customConfig?.payload_type ?? 'json',
  );

  const [headersJson, setHeadersJson] = useState(safeJsonStringify(customConfig?.headers ?? {}));

  const [messageTemplate, setMessageTemplate] = useState(initialConfig?.message_template ?? '');
  const [payloadTemplateJson, setPayloadTemplateJson] = useState(
    customConfig?.payload_template !== undefined
      ? safeJsonStringify(customConfig.payload_template)
      : '',
  );

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
`;
    } else if (headContent.trim() === "") {
      result += upstreamContent;
    } else if (headContent.includes("const canSubmit = useMemo")) {
      result += `
  const telegramHasStoredToken = Boolean(
    telegramConfig?.bot_token_configured ||
    telegramConfig?.bot_token_secret_ref ||
    telegramConfig?.bot_token_source,
  );
  const telegramUsesSecretRef = showAdvancedTelegram && telegramTokenMode === 'secret_ref';
  const telegramHasUsableToken = telegramUsesSecretRef
    ? telegramBotTokenSecretRef.trim().length > 0
    : telegramBotToken.trim().length > 0 || Boolean(channel && telegramHasStoredToken);
  
  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (type === 'webhook') {
      if (preset === 'telegram') {
        return telegramChatId.trim().length > 0 && telegramHasUsableToken;
      } else {
        return !!url.trim() && headersParse.ok && payloadTemplateParse.ok;
      }
    } else if (type === 'email') {
      return !!emailApiKey.trim() && !!emailFrom.trim() && !!emailTo.trim();
    }
    return false;
  }, [
    name, type, preset, url, headersParse.ok, payloadTemplateParse.ok,
    telegramChatId, telegramHasUsableToken,
    emailApiKey, emailFrom, emailTo
  ]);
`;
    } else if (headContent.includes("let config: AnyNotificationChannelConfig;")) {
      result += upstreamContent;
    } else if (headContent.includes("<option value=\"webhook\">")) {
      result += `
        <label className={labelClass}>{t('notification_form.type')}</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'webhook' | 'email')}
          className={selectClass}
          disabled={!!channel}
        >
          <option value="webhook">{t('notification_form.type_webhook')}</option>
          <option value="email">{t('notification_form.type_email')}</option>
        </select>
      </div>

      {type === 'webhook' && (
        <div className="space-y-5 mt-5">
`;
      result += upstreamContent;
    } else if (headContent.trim() === "") { // another empty head
      result += upstreamContent;
    } else {
      // Just fallback to something to catch unhandled
      result += "\n// UNHANDLED CONFLICT\n";
    }
    
    result += tail;
  }
  return result;
}

const resolved = resolveConflicts(text);
fs.writeFileSync('apps/web/src/components/NotificationChannelForm.tsx', resolved);
