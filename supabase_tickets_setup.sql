-- Script para criar a tabela 'tickets' e configurar RLS
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários autenticados criem seus próprios tickets
DROP POLICY IF EXISTS "Users can create their own tickets" ON public.tickets;
CREATE POLICY "Users can create their own tickets" ON public.tickets
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para permitir que usuários vejam apenas seus próprios tickets
DROP POLICY IF EXISTS "Users can view their own tickets" ON public.tickets;
CREATE POLICY "Users can view their own tickets" ON public.tickets
FOR SELECT USING (auth.uid() = user_id);

-- Política para permitir que usuários excluam seus próprios tickets (opcional)
DROP POLICY IF EXISTS "Users can delete their own tickets" ON public.tickets;
CREATE POLICY "Users can delete their own tickets" ON public.tickets
FOR DELETE USING (auth.uid() = user_id);

-- Política para permitir que administradores gerenciem todos os tickets
DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.tickets;
CREATE POLICY "Admins can manage all tickets" ON public.tickets
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);

-- Criar um índice para user_id
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
