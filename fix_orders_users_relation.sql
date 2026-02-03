-- Garantir que orders.user_id referencie public.users(id) para permitir Joins no Supabase
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_user_id_fkey;

ALTER TABLE public.orders
ADD CONSTRAINT orders_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.users(id)
ON DELETE CASCADE;
