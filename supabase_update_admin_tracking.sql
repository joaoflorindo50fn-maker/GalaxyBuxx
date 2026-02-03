-- Adicionar coluna handled_by à tabela orders para rastrear qual admin atendeu o pedido
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES public.users(id);

-- Criar tabela de configurações do site
CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inserir configuração inicial da loja
INSERT INTO public.site_settings (key, value)
VALUES ('store_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- Habilitar RLS para site_settings
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Permitir leitura pública das configurações
CREATE POLICY "Public read access for site_settings" ON public.site_settings
FOR SELECT USING (true);

-- Permitir que admins gerenciem as configurações
CREATE POLICY "Admins can manage site_settings" ON public.site_settings
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.is_admin = true
    )
);
