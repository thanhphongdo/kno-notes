CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "note_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" text NOT NULL,
	"title" text NOT NULL,
	"title_norm" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_norm" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"tag_slugs" text[] DEFAULT '{}' NOT NULL,
	"tag_names" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"quiz_count" integer DEFAULT 0 NOT NULL,
	"content_sha" text
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'light' NOT NULL,
	"font_size" integer DEFAULT 17 NOT NULL,
	"view" text DEFAULT 'grid' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"recent_searches" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_index" ADD CONSTRAINT "note_index_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_index_user_note_unique" ON "note_index" USING btree ("user_id","note_id");--> statement-breakpoint
CREATE INDEX "note_index_user_updated_idx" ON "note_index" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "note_index_user_priority_idx" ON "note_index" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "note_index_user_favorite_idx" ON "note_index" USING btree ("user_id","favorite");--> statement-breakpoint
CREATE INDEX "note_index_tag_slugs_idx" ON "note_index" USING gin ("tag_slugs");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_slug_unique" ON "tags" USING btree ("user_id","slug");