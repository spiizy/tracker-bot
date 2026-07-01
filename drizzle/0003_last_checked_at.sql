ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone DEFAULT now() NOT NULL;
