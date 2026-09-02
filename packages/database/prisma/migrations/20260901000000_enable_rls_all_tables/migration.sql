-- Supabase security advisor flagged every table in `public` as publicly readable/writable
-- via the auto-generated Data API (PostgREST), because Row-Level Security was never enabled.
-- The app never uses the Data API (all DB access is server-side Prisma over the `postgres`
-- role, which has BYPASSRLS), so the correct fix is default-deny: enable RLS with zero
-- policies on every table. This blocks anon/authenticated PostgREST access entirely while
-- leaving Prisma's direct connection completely unaffected.

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."otp_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."city_pricing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transport_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transport_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."driver_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ride_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."urban_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."urban_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."property_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guide_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."device_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_service_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."public_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."emergency_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."service_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_category_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_ticket_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_merch_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_booking_merch_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizer_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ad_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vivre_wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;
