-- BE-070: trigram index for product-name search (customers already has one from BE-005).
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON "products" USING gin ("name" gin_trgm_ops);
