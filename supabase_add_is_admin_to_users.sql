-- Adicionar a coluna 'is_admin' à tabela 'public.users' se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE public.users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;

-- Opcional: Criar um índice para a coluna is_admin para buscas mais rápidas
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users (is_admin);

-- Exemplo de como tornar um usuário admin (substitua o UUID pelo ID real do usuário)
-- UPDATE public.users SET is_admin = TRUE WHERE id = 'SEU_USER_ID_AQUI';
