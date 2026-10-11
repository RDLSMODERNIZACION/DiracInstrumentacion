ALTER TABLE public.manifolds DROP CONSTRAINT manifolds_diagram_symbol_check;
ALTER TABLE public.manifolds ADD CONSTRAINT manifolds_diagram_symbol_check CHECK (diagram_symbol IS NULL OR diagram_symbol IN ('sand_filter','mixer','sedimenter','dosing_tank','dosing_pump'));
