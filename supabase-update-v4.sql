-- Adiciona o campo de observações gerais que podem ser editadas a qualquer momento
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS observations TEXT DEFAULT '';
