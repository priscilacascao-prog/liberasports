-- Adiciona o campo de WhatsApp do cliente
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_whatsapp TEXT DEFAULT '';
