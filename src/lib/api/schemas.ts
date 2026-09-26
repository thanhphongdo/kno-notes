// src/lib/api/schemas.ts
// Một nơi duy nhất cho mọi shape body, dùng chung bởi API nội bộ, `/api/v1` và MCP.
import { z } from 'zod';

export const PrioritySchema = z.enum(['high', 'medium', 'low']);

export const NoteImageSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().max(300).default(''),
  src: z.string().max(500),
});

export const NoteWriteSchema = z.object({
  title: z.string().max(300).default(''),
  desc: z.string().max(1000).default(''),
  tags: z.array(z.string().min(1).max(80)).max(20).default([]),
  priority: PrioritySchema.default('medium'),
  content: z.string().max(400_000).default(''),
  images: z.array(NoteImageSchema).max(50).default([]),
  changeNote: z.string().max(200).optional(),
});

export const CommentSchema = z.object({ text: z.string().min(1).max(4000) });

export const HighlightSchema = z.object({ content: z.string().max(400_000) });

export const QuestionSchema = z.object({
  q: z.string().min(1).max(1000),
  options: z.array(z.string().max(500)).length(4),
  answer: z.number().int().min(0).max(3),
  explain: z.string().max(2000).default(''),
});

export const QuizRecordSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  source: z.enum(['ai', 'offline']),
  picks: z.array(z.number().int().min(0).max(3).nullable()).max(50),
  questions: z.array(QuestionSchema).max(50),
});

export const PrefsSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  fontSize: z.number().int().min(14).max(22).optional(),
  view: z.enum(['grid', 'list']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  recentSearches: z.array(z.string().max(200)).max(5).optional(),
});
