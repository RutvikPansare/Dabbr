-- Add per-item quantity tracking to daily menus
-- quantities JSONB stores {itemName: servingsPerCustomer} e.g. {"Roti": 5, "Dal": 1}
ALTER TABLE public.daily_menus
  ADD COLUMN IF NOT EXISTS quantities jsonb DEFAULT '{}' NOT NULL;

-- Add default serving quantity to quick tags
-- e.g. Roti tag has default_quantity=5, Dal tag has default_quantity=1
ALTER TABLE public.menu_quick_tags
  ADD COLUMN IF NOT EXISTS default_quantity integer DEFAULT 1 NOT NULL;
