-- Remover a coluna password_hash da tabela public.users
-- A coluna password_hash é gerenciada pela tabela auth.users do Supabase e não deve ser duplicada.
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;

-- Adicionar a coluna username à tabela public.users se ela não existir
-- O username é passado durante o registro via options.data
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;

-- Opcional: Adicionar uma restrição UNIQUE ao username se desejar que seja único
-- ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);

-- Atualizar a função handle_new_user para inserir o username
-- A função agora acessa o username do metadata do usuário recém-criado em auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar o trigger para garantir que ele use a nova versão da função
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
