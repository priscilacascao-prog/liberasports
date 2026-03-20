-- Update 'orders' table with new fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method TEXT; -- 'motoboy' or 'transportadora'

-- Create 'order_logs' table for auditing
CREATE TABLE IF NOT EXISTS public.order_logs (
    id UUID PRIMARY KEY DEFAULT (gen_random_uuid()),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    operator_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS for logs
ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to see logs of their orders
CREATE POLICY "Users can see logs of their own orders" 
ON public.order_logs 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_logs.order_id 
    AND orders.user_id = auth.uid()
));

-- Allow users to insert logs for their orders
CREATE POLICY "Users can insert logs for their own orders" 
ON public.order_logs 
FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_logs.order_id 
    AND orders.user_id = auth.uid()
));
