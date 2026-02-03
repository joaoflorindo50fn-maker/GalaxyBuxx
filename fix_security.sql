-- 1. Criar a tabela de usuários públicos se não existir
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Resetar qualquer admin acidental (Segurança Máxima)
-- CUIDADO: Se você já definiu um admin manualmente no banco, COMENTE a linha abaixo
-- UPDATE public.users SET is_admin = false WHERE is_admin IS NULL;

-- 2. Habilitar RLS na tabela de usuários
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Função auxiliar para verificar se é admin (evita recursão)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Políticas para a tabela public.users
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.users;
CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.users
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;
CREATE POLICY "Admins can view all profiles" ON public.users
    FOR SELECT USING (public.check_is_admin());

-- 5. Garantir RLS na tabela de pedidos (orders)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders" ON public.orders
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders
    FOR ALL USING (public.check_is_admin());

-- 6. Trigger para criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, is_admin)
    VALUES (new.id, new.email, false);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Garantir RLS em order_messages
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages of their own orders" ON public.order_messages;
CREATE POLICY "Users can view messages of their own orders" ON public.order_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_messages.order_id
            AND orders.user_id = auth.uid()
        )
        OR public.check_is_admin()
    );

DROP POLICY IF EXISTS "Users can insert messages to their own orders" ON public.order_messages;
CREATE POLICY "Users can insert messages to their own orders" ON public.order_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_messages.order_id
            AND orders.user_id = auth.uid()
        )
        OR public.check_is_admin()
    );
