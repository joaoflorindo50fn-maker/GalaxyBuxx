-- 1. Criar os buckets de anexos se não existirem
-- Se houver erro de permissão aqui, você pode criar os buckets manualmente no painel Storage com os nomes:
-- 'attachments' e 'tickets-attachments' (marcar como Public)
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('attachments', 'attachments', true),
    ('tickets-attachments', 'tickets-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Nota: O erro 'must be owner of table objects' geralmente ocorre ao tentar usar ALTER TABLE.
-- No Supabase, o RLS para Storage já vem habilitado por padrão ou deve ser ativado via Dashboard.

-- 2. Políticas para permitir acesso público e uploads
-- Se as políticas abaixo falharem no SQL Editor, crie-as manualmente no menu Storage > Policies

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id IN ('attachments', 'tickets-attachments'));

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id IN ('attachments', 'tickets-attachments') AND
        auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Users can manage their own uploads" ON storage.objects;
CREATE POLICY "Users can manage their own uploads" ON storage.objects
    FOR ALL USING (
        bucket_id IN ('attachments', 'tickets-attachments') AND
        auth.uid() = owner
    );
