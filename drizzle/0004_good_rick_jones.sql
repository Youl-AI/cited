ALTER TABLE "free_audits" ADD COLUMN "tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "queries" jsonb;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "guide_md" text;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "free_audits" ADD CONSTRAINT "free_audits_tier_check" CHECK ("free_audits"."tier" in ('free', 'standard', 'deluxe', 'premium'));