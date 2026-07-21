-- Fix BE-M0 oversight: Order.orderNo was missing its snake_case @map, leaving
-- the column as "orderNo" while every other column in the schema is snake_case.
ALTER TABLE "orders" RENAME COLUMN "orderNo" TO "order_no";
