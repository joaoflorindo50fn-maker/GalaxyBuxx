-- Habilitar Row Level Security (RLS) na tabela public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 1. Política para permitir INSERÇÃO de novos usuários
-- Esta política é necessária para que o trigger ou o serviço de autenticação possa criar registros.
-- Se você estiver usando o trigger 'on_auth_user_created', esta política permite que a função 'handle_new_user' insira dados.
DROP POLICY IF EXISTS "Allow new users to insert" ON public.users;
CREATE POLICY "Allow new users to insert" ON public.users
FOR INSERT WITH CHECK (TRUE);

-- 2. Política para permitir SELEÇÃO (leitura) de dados do próprio usuário
DROP POLICY IF EXISTS "Allow authenticated users to select their own data" ON public.users;
CREATE POLICY "Allow authenticated users to select their own data" ON public.users
FOR SELECT USING (auth.uid() = id);

-- 3. Política para permitir ATUALIZAÇÃO de dados do próprio usuário
DROP POLICY IF EXISTS "Allow authenticated users to update their own data" ON public.users;
CREATE POLICY "Allow authenticated users to update their own data" ON public.users
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Opcional: Política para permitir DELETAR dados do próprio usuário (se necessário)
-- DROP POLICY IF EXISTS "Allow authenticated users to delete their own data" ON public.users;
-- CREATE POLICY "Allow authenticated users to delete their own data" ON public.users
-- FOR DELETE USING (auth.uid() = id);

-- Função para sincronizar auth.users com public.users (se ainda não foi criada ou para garantir que está correta)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para chamar a função handle_new_user após a criação de um usuário em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
