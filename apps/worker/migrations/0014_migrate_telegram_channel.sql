-- Migrate existing 'telegram' type channels to 'webhook' type with 'telegram' preset.
-- This ensures backward compatibility with the new upstream Telegram webhook architecture.

UPDATE notification_channels
SET type = 'webhook',
    config_json = json_insert(config_json, '$.preset', 'telegram')
WHERE type = 'telegram';
