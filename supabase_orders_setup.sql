-- Script para criar a tabela 'orders' (pedidos) e configurar RLS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    product_name TEXT NOT NULL,
    product_game TEXT NOT NULL,
    product_image TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'Aguardando Pagamento', -- Status: Aguardando Pagamento, Em Andamento, Concluído, Cancelado
    customer_name TEXT,
    customer_contact TEXT,
    pix_key TEXT,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '15 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Política para usuários verem seus próprios pedidos
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
FOR SELECT USING (auth.uid() = user_id);

-- Política para usuários criarem pedidos
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para administradores gerenciarem todos os pedidos
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);

-- Função para limpar pedidos expirados
CREATE OR REPLACE FUNCTION delete_expired_orders() RETURNS void AS $$
BEGIN
    DELETE FROM public.orders 
    WHERE status = 'Aguardando Pagamento' 
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;
