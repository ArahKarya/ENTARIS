-- GA Inventory item image (1 foto per item, opsional)
ALTER TABLE ga_inventory_items ADD COLUMN IF NOT EXISTS image_path TEXT;
