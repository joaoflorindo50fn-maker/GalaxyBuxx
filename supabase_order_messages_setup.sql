-- Script para criar a tabela 'order_messages' e configurar RLS
CREATE TABLE IF NOT EXISTS public.order_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    message TEXT,
    attachment_url TEXT,
    is_support BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários vejam mensagens de seus próprios pedidos
DROP POLICY IF EXISTS "Users can view messages from their own orders" ON public.order_messages;
CREATE POLICY "Users can view messages from their own orders" ON public.order_messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = order_messages.order_id
        AND orders.user_id = auth.uid()
    )
);

-- Política para permitir que usuários enviem mensagens em seus próprios pedidos
DROP POLICY IF EXISTS "Users can send messages to their own orders" ON public.order_messages;
CREATE POLICY "Users can send messages to their own orders" ON public.order_messages
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = order_messages.order_id
        AND orders.user_id = auth.uid()
    )
    AND sender_id = auth.uid()
);

-- Política para permitir que administradores gerenciem todas as mensagens de pedidos
DROP POLICY IF EXISTS "Admins can manage all order messages" ON public.order_messages;
CREATE POLICY "Admins can manage all order messages" ON public.order_messages
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);

-- Criar índice para order_id
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON public.order_messages(order_id);