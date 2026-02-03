-- Script para criar a tabela 'users' se ela não existir
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Opcional: Adicionar um índice para a coluna email para buscas mais rápidas
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- Opcional: Função para atualizar a coluna updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Opcional: Trigger para chamar a função update_updated_at_column antes de cada atualização
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Exemplo de como inserir um novo usuário (apenas para teste, não use senhas em texto claro em produção!)
-- INSERT INTO public.users (email, password_hash)
-- VALUES ('novo.usuario@example.com', 'senha_criptografada_aqui');

-- Exemplo de como selecionar todos os usuários
-- SELECT * FROM public.users;
