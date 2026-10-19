-- Add averageCost field to inventory_items for weighted average costing
ALTER TABLE "inventory_items" ADD COLUMN "average_cost" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Seed averageCost from existing stock movements (weighted average of all In movements)
UPDATE inventory_items SET average_cost = sub.avg_cost
FROM (
  SELECT item_id,
    CASE WHEN SUM(CASE WHEN movement_type IN ('In', 'AdjustmentIn') THEN quantity ELSE 0 END) > 0
      THEN SUM(CASE WHEN movement_type IN ('In', 'AdjustmentIn') THEN total_value ELSE 0 END)
           / SUM(CASE WHEN movement_type IN ('In', 'AdjustmentIn') THEN quantity ELSE 0 END)
      ELSE 0
    END AS avg_cost
  FROM stock_movements
  WHERE is_cancelled = false
  GROUP BY item_id
) sub
WHERE inventory_items.id = sub.item_id;
