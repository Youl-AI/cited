ALTER TABLE "free_audits" DROP CONSTRAINT "free_audits_status_check";--> statement-breakpoint
DROP INDEX "audits_brand_created_idx";--> statement-breakpoint
ALTER TABLE "free_audits" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ALTER COLUMN "status" SET DEFAULT 'requested';--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "competitors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "self_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "source" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "free_audits" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "audits_status_created_idx" ON "free_audits" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "free_audits" ADD CONSTRAINT "free_audits_source_check" CHECK ("free_audits"."source" in ('web', 'kmong', 'manual'));--> statement-breakpoint
ALTER TABLE "free_audits" ADD CONSTRAINT "free_audits_status_check" CHECK ("free_audits"."status" in ('requested', 'verified', 'running', 'sent', 'failed', 'rejected'));