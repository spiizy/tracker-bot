ALTER TABLE "users" ADD COLUMN "lang" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "explorer" text DEFAULT 'tonviewer' NOT NULL;