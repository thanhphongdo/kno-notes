// src/lib/db/schema.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** sha256 hex of the full `kn_<32 hex>` key. The key itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    /** First 10 characters of the key, e.g. `kn_1a2b3c4` — shown in the UI. */
    prefix: text('prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_user_idx').on(t.userId)],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Display casing, e.g. "Tim mạch". */
    name: text('name').notNull(),
    /** `slugify(name)`, e.g. "tim-mach". */
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_user_slug_unique').on(t.userId, t.slug)],
);

export const noteIndex = pgTable(
  'note_index',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The note id used in the storage path and every URL, e.g. "n1". */
    noteId: text('note_id').notNull(),
    title: text('title').notNull(),
    /** norm(title) — accent-free, for search. */
    titleNorm: text('title_norm').notNull(),
    description: text('description').notNull().default(''),
    /** norm(description) — accent-free, for search. */
    descriptionNorm: text('description_norm').notNull().default(''),
    priority: text('priority').$type<'high' | 'medium' | 'low'>().notNull().default('medium'),
    favorite: boolean('favorite').notNull().default(false),
    tagSlugs: text('tag_slugs').array().notNull().default([]),
    /** Display names, index-aligned with tagSlugs. */
    tagNames: text('tag_names').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    latestVersion: integer('latest_version').notNull().default(1),
    imageCount: integer('image_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    quizCount: integer('quiz_count').notNull().default(0),
    /** Semantic sha256 of the note; invalidates the client's cached embedding. */
    contentSha: text('content_sha'),
    /**
     * Text of the note's highlighted passages (`<mark data-hl>`), capped and
     * clipped by `highlightTexts`. Denormalised here so the dashboard's `?q=`
     * filter can match a marked passage without opening every note file.
     */
    highlights: text('highlights').array().notNull().default([]),
    /**
     * Alt của ảnh: nhãn ảnh đính kèm + alt của `<img>` lồng trong bài. Cùng lý
     * do denormalise như `highlights` — lọc `?q=` không phải mở từng file.
     */
    imageAlts: text('image_alts').array().notNull().default([]),
  },
  (t) => [
    uniqueIndex('note_index_user_note_unique').on(t.userId, t.noteId),
    index('note_index_user_updated_idx').on(t.userId, t.updatedAt.desc()),
    index('note_index_user_priority_idx').on(t.userId, t.priority),
    index('note_index_user_favorite_idx').on(t.userId, t.favorite),
    index('note_index_tag_slugs_idx').using('gin', t.tagSlugs),
  ],
);

/**
 * Client OAuth tự đăng ký (RFC 7591).
 *
 * Không có cột bí mật: đây đều là client công khai dùng PKCE, nên không có
 * `client_secret` nào để lộ trong file cấu hình trên máy người dùng.
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mã uỷ quyền đang chờ được đổi lấy token.
 *
 * Lưu BĂM chứ không lưu mã, như API key. Và phải lưu thật chứ không nhét vào
 * một JWT: chuẩn bắt mã chỉ dùng được đúng một lần, mà "một lần" thì cần một
 * chỗ để xoá đi sau khi dùng.
 */
export const oauthCodes = pgTable(
  'oauth_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    clientId: text('client_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    /** PKCE S256. Đây là thứ ràng mã với đúng client đã xin nó. */
    codeChallenge: text('code_challenge').notNull(),
    scope: text('scope').notNull(),
    resource: text('resource').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('oauth_codes_expires_idx').on(t.expiresAt)],
);

export const userPrefs = pgTable('user_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').$type<'light' | 'dark'>().notNull().default('light'),
  fontSize: integer('font_size').notNull().default(17),
  view: text('view').$type<'grid' | 'list'>().notNull().default('grid'),
  sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
  recentSearches: jsonb('recent_searches').$type<string[]>().notNull().default([]),
});

export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type NoteIndexDbRow = typeof noteIndex.$inferSelect;
export type UserPrefsRow = typeof userPrefs.$inferSelect;
export type OAuthClientRow = typeof oauthClients.$inferSelect;
export type OAuthCodeRow = typeof oauthCodes.$inferSelect;
