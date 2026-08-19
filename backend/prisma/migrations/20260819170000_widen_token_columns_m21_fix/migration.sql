-- Bug fix (UPD-BE-072): `tokens` was VARCHAR(191) on both tables — too narrow for a real
-- encrypted OAuth token blob (found live via a WooCommerce connect that overflowed it with a
-- real Prisma P2000 error). Widened to TEXT.

-- AlterTable
ALTER TABLE `integrations` MODIFY `tokens` TEXT NULL;

-- AlterTable
ALTER TABLE `social_accounts` MODIFY `tokens` TEXT NULL;
