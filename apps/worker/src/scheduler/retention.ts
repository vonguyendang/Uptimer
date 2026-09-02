import type { Env } from '../env';

import {
  RETENTION_DELETE_BATCH_SIZE,
  RETENTION_MAX_BATCHES_PER_RUN,
} from '@uptimer/db';

import { readSettings } from '../settings';
import { acquireLease } from './lock';

const LOCK_NAME = 'retention:check_results';
const LOCK_LEASE_SECONDS = 10 * 60;

export async function runRetention(env: Env, controller: ScheduledController): Promise<void> {
  const now = Math.floor((controller.scheduledTime ?? Date.now()) / 1000);

  const acquired = await acquireLease(env.DB, LOCK_NAME, now, LOCK_LEASE_SECONDS);
  if (!acquired) return;

  const settings = await readSettings(env.DB);
  const retentionDays = settings.retention_check_results_days;

  const cutoff = now - retentionDays * 86400;
  if (!Number.isFinite(cutoff) || cutoff <= 0) return;

  let totalDeleted = 0;

  let batchesRun = 0;
  for (let i = 0; i < RETENTION_MAX_BATCHES_PER_RUN; i++) {
    batchesRun++;
    const r = await env.DB.prepare(
      `
        DELETE FROM check_results
        WHERE id IN (
          SELECT id
          FROM check_results
          WHERE checked_at < ?1
          ORDER BY checked_at
          LIMIT ?2
        )
      `,
    )
      .bind(cutoff, RETENTION_DELETE_BATCH_SIZE)
      .run();

    const deleted = r.meta.changes ?? 0;
    totalDeleted += deleted;

    if (deleted < RETENTION_DELETE_BATCH_SIZE) break;
  }

  let backlogRemaining: string | number = 0;
  if (batchesRun === RETENTION_MAX_BATCHES_PER_RUN) {
    backlogRemaining = 'unknown (exceeded batch limit)';
  }

  // Delete historical daily rollups older than 90 days to save space
  const rollupsCutoff = now - 90 * 86400;
  const rollupsResult = await env.DB.prepare(
    `DELETE FROM monitor_daily_rollups WHERE day_start_at < ?1`
  )
    .bind(rollupsCutoff)
    .run();
  const rollupsDeleted = rollupsResult.meta.changes ?? 0;

  console.log(`retention: deleted=${totalDeleted} batches=${batchesRun} backlog_remaining=${backlogRemaining} cutoff=${cutoff} days=${retentionDays} rollups_deleted=${rollupsDeleted}`);
}
