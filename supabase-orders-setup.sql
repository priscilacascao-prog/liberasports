-- Create 'orders' table for LIBERA SPORTS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id UUID DEFAULT (auth.uid()) NOT NULL,
    client TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    deadline DATE NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pedido',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own orders
CREATE POLICY "Users can manage their own orders" 
ON public.orders 
FOR ALL 
USING (auth.uid() = user_id);
