const fs = require('fs');
let content = fs.readFileSync('apps/worker/src/routes/admin.ts', 'utf8');

// Conflict 1: lines 43
content = content.replace(/<<<<<<< HEAD\nimport type { AnyNotificationChannel } from '\.\.\/notify\/dispatcher';\n=======\nimport {\n  dispatchWebhookToChannelLegacy,\n  dispatchWebhookToChannels,\n  type WebhookChannel,\n} from '\.\.\/notify\/webhook';\nimport { encryptTelegramBotToken } from '\.\.\/notify\/telegram-token';\n>>>>>>> upstream\/master\n/g, `import type { AnyNotificationChannel } from '../notify/dispatcher';
import { encryptTelegramBotToken } from '../notify/telegram-token';
`);

// Conflict 2: lines 825
const conflict2Regex = /<<<<<<< HEAD\nfunction parseChannelConfig[\s\S]*?=======\n([\s\S]*?)>>>>>>> upstream\/master\n/g;
content = content.replace(conflict2Regex, (match, upstreamCode) => {
  return upstreamCode + `
function parseChannelConfig(type: string, configJson: string): AnyNotificationChannel['config'] {
  if (type === 'email') {
    return parseDbJson(emailChannelConfigSchema, configJson, { field: 'config_json' });
  } else {
    const config = parseDbJson(webhookChannelConfigSchema, configJson, { field: 'config_json' });
    return sanitizeNotificationConfigForApi(config);
  }
}

function serializeChannelConfig(type: string, config: AnyNotificationChannel['config']): string {
  if (type === 'email') {
    return serializeDbJson(emailChannelConfigSchema, config, { field: 'config_json' });
  } else {
    return serializeDbJson(webhookChannelConfigSchema, config, { field: 'config_json' });
  }
}
`;
});

// Conflict 3: line 951
content = content.replace(/<<<<<<< HEAD\n    config_json: parseChannelConfig\(row\.type, row\.config_json\),\n=======\n    config_json: sanitizeNotificationConfigForApi\(config\),\n>>>>>>> upstream\/master\n/g, `    config_json: parseChannelConfig(row.type, row.config_json),\n`);

// Conflict 4: line 993
const conflict4Regex = /<<<<<<< HEAD\n  const configJson = serializeChannelConfig\(input\.type, input\.config_json\);\n=======\n  const storageConfig = await normalizeNotificationConfigForStorage\(c\.env, input\.config_json\);\n  const configJson = serializeDbJson\(webhookChannelConfigSchema, storageConfig, \{\n    field: 'config_json',\n  \}\);\n>>>>>>> upstream\/master\n/g;
content = content.replace(conflict4Regex, `
  let configJson: string;
  if (input.type === 'email') {
    configJson = serializeChannelConfig('email', input.config_json);
  } else {
    const storageConfig = await normalizeNotificationConfigForStorage(c.env, input.config_json);
    configJson = serializeDbJson(webhookChannelConfigSchema, storageConfig, { field: 'config_json' });
  }
`);

// Conflict 5: line 1049
const conflict5Regex = /<<<<<<< HEAD\n      \? serializeChannelConfig\(existing\.type, input\.config_json\)\n=======\n      \? serializeDbJson\(\n          webhookChannelConfigSchema,\n          await normalizeNotificationConfigForStorage\(c\.env, input\.config_json, existingConfig\),\n          \{ field: 'config_json' \},\n        \)\n>>>>>>> upstream\/master\n/g;
content = content.replace(conflict5Regex, `
      ? (
          existing.type === 'email'
            ? serializeChannelConfig('email', input.config_json)
            : serializeDbJson(
                webhookChannelConfigSchema,
                await normalizeNotificationConfigForStorage(c.env, input.config_json, existingConfig),
                { field: 'config_json' }
              )
        )
`);

fs.writeFileSync('apps/worker/src/routes/admin.ts', content);
