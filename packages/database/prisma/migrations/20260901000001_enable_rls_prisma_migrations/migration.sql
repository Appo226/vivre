-- Close the last gap: _prisma_migrations was the only public-schema table still exposed
-- via the Data API after the previous migration. It holds migration filenames/checksums,
-- not user data, but there's no reason to leave any table open.

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
