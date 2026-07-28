CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"query_id" text NOT NULL,
	"query_text" text NOT NULL,
	"engine_id" text NOT NULL,
	"sample_index" smallint NOT NULL,
	"text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_engine_id_check" CHECK ("answers"."engine_id" in ('chatgpt', 'gemini', 'naver', 'google_aio'))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ambiguous" boolean DEFAULT false NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"query_quota" integer DEFAULT 0 NOT NULL,
	"collection_weekday" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"completeness" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metrics" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "collection_runs_status_check" CHECK ("collection_runs"."status" in ('running', 'succeeded', 'partial', 'failed')),
	CONSTRAINT "collection_runs_trigger_check" CHECK ("collection_runs"."trigger" in ('schedule', 'signup', 'manual', 'free_audit'))
);
--> statement-breakpoint
CREATE TABLE "detections" (
	"id" text PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"subject" text NOT NULL,
	"mentioned" boolean NOT NULL,
	"position" integer,
	"sentiment" text,
	"context" text,
	"detector_version" integer NOT NULL,
	"unresolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detections_sentiment_check" CHECK ("detections"."sentiment" is null or "detections"."sentiment" in ('recommended', 'neutral', 'negative'))
);
--> statement-breakpoint
CREATE TABLE "free_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_name" text NOT NULL,
	"category" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"ip_hash" text NOT NULL,
	"variant" text DEFAULT 'cba' NOT NULL,
	"converted_email_at" timestamp with time zone,
	"converted_signup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_audits_status_check" CHECK ("free_audits"."status" in ('queued', 'running', 'succeeded', 'failed', 'waitlisted'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount_krw" integer NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb,
	"failure_code" text,
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('paid', 'failed', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queries_source_check" CHECK ("queries"."source" in ('generated', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "serpapi_usage" (
	"period" varchar(7) PRIMARY KEY NOT NULL,
	"plan_limit" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"alerted_80" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"query_packs" integer DEFAULT 0 NOT NULL,
	"billing_key" text,
	"customer_key" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'past_due', 'suspended', 'canceled')),
	CONSTRAINT "subscriptions_plan_check" CHECK ("subscriptions"."plan" in ('free', 'starter', 'business'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('user', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_run_id_collection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detections" ADD CONSTRAINT "detections_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "answers_run_idx" ON "answers" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_unique_idx" ON "answers" USING btree ("run_id","query_id","engine_id","sample_index");--> statement-breakpoint
CREATE INDEX "brands_user_idx" ON "brands" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brands_weekday_idx" ON "brands" USING btree ("collection_weekday","is_active");--> statement-breakpoint
CREATE INDEX "runs_brand_started_idx" ON "collection_runs" USING btree ("brand_id","started_at");--> statement-breakpoint
CREATE INDEX "detections_answer_idx" ON "detections" USING btree ("answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "detections_unique_idx" ON "detections" USING btree ("answer_id","subject","detector_version");--> statement-breakpoint
CREATE INDEX "audits_iphash_created_idx" ON "free_audits" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "audits_brand_created_idx" ON "free_audits" USING btree ("brand_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "queries_brand_idx" ON "queries" USING btree ("brand_id","is_active");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");