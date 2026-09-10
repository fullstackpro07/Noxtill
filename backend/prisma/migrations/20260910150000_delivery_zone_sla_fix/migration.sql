-- Per-zone SLA depth fix: the delivery-time promise was a single business-wide setting only. Adds
-- a real `Delivery` -> `DeliveryZone` link (set manually — zones carry no geofence to auto-match an
-- address to) and a real per-zone SLA override (`DeliveryZone.slaMinutes`, NULL = use the business
-- default).

-- AlterTable
ALTER TABLE `deliveries` ADD COLUMN `zone_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `delivery_zones` ADD COLUMN `sla_minutes` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `delivery_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
