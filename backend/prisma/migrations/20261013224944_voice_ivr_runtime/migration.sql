ALTER TABLE `phone_calls`
    ADD COLUMN `ivr_flow_version_id` VARCHAR(191) NULL,
    ADD COLUMN `ivr_current_node_id` VARCHAR(80) NULL,
    ADD INDEX `phone_calls_business_ivr_version_idx` (`business_id`, `ivr_flow_version_id`);

ALTER TABLE `phone_calls`
    ADD CONSTRAINT `phone_calls_ivr_flow_version_id_fkey`
    FOREIGN KEY (`ivr_flow_version_id`) REFERENCES `voice_ivr_flow_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
