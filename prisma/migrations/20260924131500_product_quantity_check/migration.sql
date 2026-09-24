-- Defence in depth for the core invariant: stock can never be negative, even if a
-- future code path bypassed applyStockMovement() (src/lib/stock.ts). Prisma does not
-- model CHECK constraints, so this exists only in PostgreSQL migrations; SQLite mode
-- (prisma db push) relies on the conditional update in applyStockMovement() alone.
ALTER TABLE "Product" ADD CONSTRAINT "Product_quantity_non_negative" CHECK ("quantity" >= 0);
