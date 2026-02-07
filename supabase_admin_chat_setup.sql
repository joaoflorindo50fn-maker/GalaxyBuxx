-- Script para criar a tabela de chat interno dos admins
CREATE TABLE IF NOT EXISTS public.admin_team_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.admin_team_messages ENABLE ROW LEVEL SECURITY;

-- Política: Apenas admins podem ver mensagens do chat da equipe
DROP POLICY IF EXISTS "Admins can view team messages" ON public.admin_team_messages;
CREATE POLICY "Admins can view team messages" ON public.admin_team_messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);

-- Política: Apenas admins podem enviar mensagens no chat da equipe
DROP POLICY IF EXISTS "Admins can send team messages" ON public.admin_team_messages;
CREATE POLICY "Admins can send team messages" ON public.admin_team_messages
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
    AND sender_id = auth.uid()
);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_admin_team_messages_created_at ON public.admin_team_messages(created_at);
