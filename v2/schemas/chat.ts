/**
 * Histórico de chat sobre o processo. Guardado em
 * `processos.chat_messages` (jsonb array).
 */
import { z } from 'zod';

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  ts: z.string().describe('ISO 8601 timestamp'),
});

export const ChatHistorySchema = z.array(ChatMessageSchema).default([]);

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatHistory = z.infer<typeof ChatHistorySchema>;
