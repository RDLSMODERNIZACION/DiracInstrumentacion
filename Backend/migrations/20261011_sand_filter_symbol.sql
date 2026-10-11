ALTER TABLE public.manifolds ADD COLUMN IF NOT EXISTS diagram_symbol text;
ALTER TABLE public.manifolds ADD CONSTRAINT manifolds_diagram_symbol_check CHECK (diagram_symbol IS NULL OR diagram_symbol = 'sand_filter');
