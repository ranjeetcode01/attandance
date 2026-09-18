CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"firm_name" text DEFAULT '' NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "labour_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_id" uuid NOT NULL,
	"labourer_id" integer,
	"trade" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'P' NOT NULL,
	"ot_hours" real DEFAULT 0 NOT NULL,
	"rate" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_sheets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_date" date NOT NULL,
	"site_id" integer NOT NULL,
	"contractor_id" integer NOT NULL,
	"marked_by" integer NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"punch_time" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy" real,
	"distance_m" real,
	"inside_fence" boolean,
	"offline" boolean DEFAULT false NOT NULL,
	"photo_path" text,
	"ppe_checked" boolean DEFAULT false NOT NULL,
	"toolbox_talk" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" text DEFAULT 'ok' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labourers" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_id" integer NOT NULL,
	"name" text NOT NULL,
	"trade" text NOT NULL,
	"daily_wage" real DEFAULT 0 NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"id_last4" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"builder" text DEFAULT '' NOT NULL,
	"rera_no" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "punches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"site_id" integer,
	"type" text NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"punch_time" timestamp with time zone NOT NULL,
	"work_date" date NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy" real,
	"distance_m" real,
	"inside_fence" boolean,
	"offline" boolean DEFAULT false NOT NULL,
	"selfie_path" text,
	"selfie_hash" text,
	"work_area" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"device_id" text,
	"session_id" text,
	"perf_now" double precision,
	"seq" integer,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" text DEFAULT 'ok' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"leave_type" text DEFAULT '' NOT NULL,
	"site_id" integer,
	"in_time" text DEFAULT '' NOT NULL,
	"out_time" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer DEFAULT 200 NOT NULL,
	"shift_start" text DEFAULT '09:00' NOT NULL,
	"shift_end" text DEFAULT '18:00' NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sites" (
	"user_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	CONSTRAINT "user_sites_user_id_site_id_pk" PRIMARY KEY("user_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"emp_code" text NOT NULL,
	"name" text NOT NULL,
	"mobile" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"wage_type" text DEFAULT 'monthly' NOT NULL,
	"wage_amount" real DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_emp_code_unique" UNIQUE("emp_code"),
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD CONSTRAINT "labour_entries_sheet_id_labour_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."labour_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD CONSTRAINT "labour_entries_labourer_id_labourers_id_fk" FOREIGN KEY ("labourer_id") REFERENCES "public"."labourers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_sheets" ADD CONSTRAINT "labour_sheets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_sheets" ADD CONSTRAINT "labour_sheets_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_sheets" ADD CONSTRAINT "labour_sheets_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_sheets" ADD CONSTRAINT "labour_sheets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labourers" ADD CONSTRAINT "labourers_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "labour_entries_sheet_idx" ON "labour_entries" USING btree ("sheet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labour_sheet_unique" ON "labour_sheets" USING btree ("work_date","site_id","contractor_id");--> statement-breakpoint
CREATE INDEX "labour_sheet_date_idx" ON "labour_sheets" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "labourers_contractor_idx" ON "labourers" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "punches_user_date_idx" ON "punches" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "punches_date_idx" ON "punches" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "punches_site_date_idx" ON "punches" USING btree ("site_id","work_date");--> statement-breakpoint
CREATE INDEX "punches_review_idx" ON "punches" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "punches_hash_idx" ON "punches" USING btree ("selfie_hash");--> statement-breakpoint
CREATE INDEX "punches_device_idx" ON "punches" USING btree ("device_id","seq");--> statement-breakpoint
CREATE INDEX "requests_user_idx" ON "requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sites_project_idx" ON "sites" USING btree ("project_id");