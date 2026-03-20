-- Adiciona o campo de motivo de pendência
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pending_reason TEXT;
