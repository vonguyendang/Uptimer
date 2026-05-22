-- Recreate notification_channels table to support email and telegram types.
PRAGMA foreign_keys=OFF;

ALTER TABLE notification_channels RENAME TO notification_channels_old;

CREATE TABLE IF NOT EXISTS notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('webhook', 'email', 'telegram')),
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

INSERT INTO notification_channels (id, name, type, config_json, is_active, created_at)
SELECT id, name, type, config_json, is_active, created_at FROM notification_channels_old;

DROP TABLE notification_channels_old;

PRAGMA foreign_keys=ON;
