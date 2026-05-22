import {
  webhookChannelConfigSchema,
  telegramChannelConfigSchema,
  emailChannelConfigSchema,
} from '@uptimer/db';
import { z } from 'zod';

export const createNotificationChannelInputSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().min(1),
    type: z.literal('webhook'),
    config_json: webhookChannelConfigSchema,
    is_active: z.boolean().optional(),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal('telegram'),
    config_json: telegramChannelConfigSchema,
    is_active: z.boolean().optional(),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal('email'),
    config_json: emailChannelConfigSchema,
    is_active: z.boolean().optional(),
  }),
]);

export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelInputSchema>;

export const patchNotificationChannelInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    config_json: z.union([
      webhookChannelConfigSchema,
      telegramChannelConfigSchema,
      emailChannelConfigSchema,
    ]).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided',
  });

export type PatchNotificationChannelInput = z.infer<typeof patchNotificationChannelInputSchema>;

