-- Script para criar a tabela 'ticket_messages' e configurar RLS
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    message TEXT,
    attachment_url TEXT,
    is_support BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários vejam mensagens de seus próprios tickets
DROP POLICY IF EXISTS "Users can view messages from their own tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages from their own tickets" ON public.ticket_messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.tickets
        WHERE tickets.id = ticket_messages.ticket_id
        AND tickets.user_id = auth.uid()
    )
);

-- Política para permitir que usuários enviem mensagens em seus próprios tickets
DROP POLICY IF EXISTS "Users can send messages to their own tickets" ON public.ticket_messages;
CREATE POLICY "Users can send messages to their own tickets" ON public.ticket_messages
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tickets
        WHERE tickets.id = ticket_messages.ticket_id
        AND tickets.user_id = auth.uid()
    )
    AND sender_id = auth.uid()
);

-- Política para permitir que administradores gerenciem todas as mensagens
DROP POLICY IF EXISTS "Admins can manage all ticket messages" ON public.ticket_messages;
CREATE POLICY "Admins can manage all ticket messages" ON public.ticket_messages
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);

-- Criar índice para ticket_id
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON public.ticket_messages(ticket_id);
