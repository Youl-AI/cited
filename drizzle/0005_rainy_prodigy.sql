ALTER TABLE "brands" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "self_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "query_generations" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "queries_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "from_audit_id" text;