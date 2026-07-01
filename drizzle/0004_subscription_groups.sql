CREATE TABLE IF NOT EXISTS "subscription_groups" (
	"subscription_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_groups_subscription_id_group_id_pk" PRIMARY KEY("subscription_id","group_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_groups" ADD CONSTRAINT "subscription_groups_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_groups" ADD CONSTRAINT "subscription_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "subscription_groups" ("subscription_id", "group_id")
SELECT "id", "group_id"
FROM "subscriptions"
WHERE "group_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_groups_group_idx" ON "subscription_groups" USING btree ("group_id");
