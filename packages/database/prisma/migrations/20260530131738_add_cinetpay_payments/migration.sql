-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending_payment',
ALTER COLUMN "payment_method" SET DEFAULT 'orange_money';

-- AlterTable
ALTER TABLE "property_bookings" ALTER COLUMN "status" SET DEFAULT 'pending_payment';

-- AlterTable
ALTER TABLE "transport_bookings" ALTER COLUMN "status" SET DEFAULT 'pending_payment';
