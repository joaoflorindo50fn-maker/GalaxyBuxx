-- Atualizar políticas de tickets para usar a função de admin segura
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own tickets" ON public.tickets;
CREATE POLICY "Users can create their own tickets" ON public.tickets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.tickets;
CREATE POLICY "Users can view their own tickets" ON public.tickets
    FOR SELECT USING (auth.uid() = user_id OR public.check_is_admin());

DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.tickets;
CREATE POLICY "Admins can manage all tickets" ON public.tickets
    FOR ALL USING (public.check_is_admin());

-- Atualizar políticas de ticket_messages
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages from their own tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages from their own tickets" ON public.ticket_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tickets
            WHERE tickets.id = ticket_messages.ticket_id
            AND tickets.user_id = auth.uid()
        )
        OR public.check_is_admin()
    );

DROP POLICY IF EXISTS "Users can send messages to their own tickets" ON public.ticket_messages;
CREATE POLICY "Users can send messages to their own tickets" ON public.ticket_messages
    FOR INSERT WITH CHECK (
        (
            EXISTS (
                SELECT 1 FROM public.tickets
                WHERE tickets.id = ticket_messages.ticket_id
                AND tickets.user_id = auth.uid()
            )
            AND sender_id = auth.uid()
        )
        OR public.check_is_admin()
    );

DROP POLICY IF EXISTS "Admins can manage all ticket messages" ON public.ticket_messages;
CREATE POLICY "Admins can manage all ticket messages" ON public.ticket_messages
    FOR ALL USING (public.check_is_admin());
