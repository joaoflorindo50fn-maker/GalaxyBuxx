document.addEventListener('DOMContentLoaded', async () => {
    const supportForm = document.getElementById('mainSupportForm');
    const ticketsContainer = document.getElementById('ticketsContainer');
    const emptyTickets = document.getElementById('emptyTickets');
    const ticketsListCard = document.getElementById('ticketsListCard');
    const navItems = document.querySelectorAll('.support-nav-item');
    const views = document.querySelectorAll('.support-view');
    
    // Chat Elements
    const chatTicketView = document.getElementById('chatTicketView');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatTicketSubject = document.getElementById('chatTicketSubject');
    const chatTicketId = document.getElementById('chatTicketId');
    const chatTicketStatus = document.getElementById('chatTicketStatus');
    const backToList = document.getElementById('backToList');
    const closeTicketBtn = document.getElementById('closeTicketBtn');
    const confirmOverlay = document.getElementById('confirmOverlay');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    const fileAttachment = document.getElementById('fileAttachment');
    const attachmentPreview = document.getElementById('attachmentPreview');
    const fileNameDisplay = document.getElementById('fileName');
    const removeAttachment = document.getElementById('removeAttachment');

    let currentTicket = null;
    let messageSubscription = null;
    let currentUser = null;
    const adminNamesCache = {};

    // Inicializar o Supabase
    const supabase = window.supabaseClient || (window.getSupabase ? window.getSupabase() : null);

    if (!supabase) {
        console.error('Supabase client not found. Make sure core.js is loaded.');
        showNotification('Erro de conexão com o banco de dados.', 'error');
        return;
    }

    // Pre-preencher campos se logado
    async function prefillUserInfo() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            if (supportForm) {
                const nameInput = supportForm.querySelector('input[name="name"]');
                const emailInput = supportForm.querySelector('input[name="email"]');
                
                if (nameInput) {
                    const metadata = user.user_metadata || {};
                    nameInput.value = metadata.full_name || metadata.username || metadata.name || user.email.split('@')[0];
                }
                if (emailInput) {
                    emailInput.value = user.email;
                }
            }
        }
    }

    prefillUserInfo();

    // Função para carregar tickets
    async function loadTickets() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                if (emptyTickets) emptyTickets.style.display = 'flex';
                if (ticketsContainer) ticketsContainer.innerHTML = '';
                return;
            }

            const { data: tickets, error } = await supabase
                .from('tickets')
                .select('*')
                .eq('user_id', user.id)
                .neq('status', 'resolved')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (tickets && tickets.length > 0) {
                if (emptyTickets) emptyTickets.style.display = 'none';
                if (ticketsListCard) ticketsListCard.style.display = 'block';
                renderTickets(tickets);
            } else {
                if (emptyTickets) emptyTickets.style.display = 'flex';
                if (ticketsListCard) ticketsListCard.style.display = 'none';
                if (ticketsContainer) ticketsContainer.innerHTML = '';
            }
        } catch (error) {
            console.error('Erro ao carregar tickets:', error);
            showNotification('Erro ao carregar seus tickets.', 'error');
        }
    }

    function renderTickets(tickets) {
        if (!ticketsContainer) return;
        
        ticketsContainer.innerHTML = tickets.map(ticket => `
            <div class="ticket-item" data-id="${ticket.id}">
                <div class="ticket-item-info">
                    <h4>${ticket.subject}</h4>
                    <div class="ticket-item-meta">
                        <span>#${ticket.id.substring(0, 8)}</span> • 
                        <span>${new Date(ticket.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
                <div class="status-badge ${ticket.status}">
                    <span class="ticket-status status-${ticket.status}">
                        ${ticket.status === 'pending' ? 'Pendente' : 'Concluído'}
                    </span>
                </div>
            </div>
        `).join('');

        // Adicionar eventos de clique
        ticketsContainer.querySelectorAll('.ticket-item').forEach(item => {
            item.onclick = () => {
                const ticketId = item.getAttribute('data-id');
                const ticket = tickets.find(t => t.id === ticketId);
                openChat(ticket);
            };
        });
    }

    // Chat Logic
    function closeChatUI() {
        if (messageSubscription) {
            supabase.removeChannel(messageSubscription);
            messageSubscription = null;
        }
        if (window.ticketChatFallback) {
            clearInterval(window.ticketChatFallback);
            window.ticketChatFallback = null;
        }
        currentTicket = null;
    }

    async function openChat(ticket) {
        if (!ticket) return;
        currentTicket = ticket;
        
        // Update UI
        chatTicketSubject.textContent = ticket.subject;
        chatTicketId.textContent = `#${ticket.id.substring(0, 8)}`;
        chatTicketStatus.textContent = ticket.status === 'pending' ? 'Pendente' : 'Concluído';
        chatTicketStatus.className = `chat-status-badge status-${ticket.status}`;
        
        // Switch View
        views.forEach(v => v.classList.remove('active'));
        chatTicketView.classList.add('active');
        
        // Load Messages
        await loadMessages(ticket.id);
        
        // Subscribe to real-time updates
        subscribeToMessages(ticket.id);
    }

    async function loadMessages(ticketId) {
        try {
            const { data: messages, error } = await supabase
                .from('ticket_messages')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            renderMessages(messages);
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
        }
    }

    function renderMessages(messages) {
        if (!chatMessages) return;
        
        const currentUserId = currentUser ? currentUser.id : null;

        let html = messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgFromAdmin = msg.is_support;
            const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            if (isMe) {
                // Estilo Antigo (Bolha simples)
                return `
                    <div class="message sent" data-msg-id="${msg.id}">
                        ${msg.message ? `<p>${msg.message}</p>` : ''}
                        ${msg.attachment_url ? `
                            <div class="message-attachment">
                                <img src="${msg.attachment_url}" alt="Anexo" onclick="window.open('${msg.attachment_url}', '_blank')">
                            </div>
                        ` : ''}
                        <span class="message-time">${time}</span>
                    </div>
                `;
            } else {
                // Estilo Novo (Com Avatar e Nome - Igual Chat de Pedidos)
                let senderName = msgFromAdmin ? "Suporte GalaxyBuxx" : "Cliente";
                let avatarUrl = msgFromAdmin 
                    ? `https://ui-avatars.com/api/?name=S&background=00d2ff&color=fff`
                    : `https://ui-avatars.com/api/?name=C&background=111&color=fff`;

                return `
                    <div class="message-wrapper theirs ${msgFromAdmin ? 'admin-msg' : ''}" data-msg-id="${msg.id}">
                        <div class="message-avatar">
                            <img src="${avatarUrl}" alt="Avatar">
                        </div>
                        <div class="message-bundle">
                            <span class="message-sender-name">${senderName}</span>
                            <div class="message-bubble">
                                ${msg.message ? `<p>${msg.message}</p>` : ''}
                                ${msg.attachment_url ? `
                                    <div class="message-attachment">
                                        <img src="${msg.attachment_url}" alt="Anexo" onclick="window.open('${msg.attachment_url}', '_blank')">
                                    </div>
                                ` : ''}
                            </div>
                            <span class="message-time-new">${time}</span>
                        </div>
                    </div>
                `;
            }
        }).join('');

        chatMessages.innerHTML = html;
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    // Link back button if it exists (using the correct variable backToList)
    if (backToList) {
        // already handled below, removing redundant block to avoid errors
    }

    function subscribeToMessages(ticketId) {
        if (messageSubscription) {
            supabase.removeChannel(messageSubscription);
        }

        // Canal com configurações de alta performance para latência mínima
        messageSubscription = supabase.channel(`ticket_chat_${ticketId}`, {
            config: {
                broadcast: { self: true },
                presence: { key: currentUser?.id }
            }
        })
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'ticket_messages',
            filter: `ticket_id=eq.${ticketId}`
        }, (payload) => {
            handleNewSupportMessage(payload.new);
        })
        .on('broadcast', { event: 'new_message' }, (payload) => {
            if (payload.payload) {
                handleNewSupportMessage(payload.payload);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log('⚡ Conexão Ultrarrápida Ativada');
            }
        });

        function handleNewSupportMessage(newMessage) {
            if (!newMessage || !newMessage.id) return;
            // Evita duplicatas mas processa na velocidade da luz
            if (document.querySelector(`[data-msg-id="${newMessage.id}"]`)) return;

            const currentUserId = currentUser ? currentUser.id : null;
            const isMe = String(newMessage.sender_id) === String(currentUserId);
            const msgFromAdmin = newMessage.is_support;
            const time = new Date(newMessage.created_at || new Date()).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            const msgElement = document.createElement('div');
            msgElement.setAttribute('data-msg-id', newMessage.id);

            if (isMe) {
                msgElement.className = 'message sent';
                msgElement.innerHTML = `
                    ${newMessage.message ? `<p>${newMessage.message}</p>` : ''}
                    ${newMessage.attachment_url ? `
                        <div class="message-attachment">
                            <img src="${newMessage.attachment_url}" alt="Anexo" onclick="window.open('${newMessage.attachment_url}', '_blank')">
                        </div>
                    ` : ''}
                    <span class="message-time">${time}</span>
                `;
            } else {
                let senderName = msgFromAdmin ? "Suporte GalaxyBuxx" : "Cliente";
                let avatarUrl = msgFromAdmin 
                    ? `https://ui-avatars.com/api/?name=S&background=00d2ff&color=fff`
                    : `https://ui-avatars.com/api/?name=C&background=111&color=fff`;

                msgElement.className = `message-wrapper theirs ${msgFromAdmin ? 'admin-msg' : ''}`;
                msgElement.innerHTML = `
                    <div class="message-avatar">
                        <img src="${avatarUrl}" alt="Avatar">
                    </div>
                    <div class="message-bundle">
                        <span class="message-sender-name">${senderName}</span>
                        <div class="message-bubble">
                            ${newMessage.message ? `<p>${newMessage.message}</p>` : ''}
                            ${newMessage.attachment_url ? `
                                <div class="message-attachment">
                                    <img src="${newMessage.attachment_url}" alt="Anexo" onclick="window.open('${newMessage.attachment_url}', '_blank')">
                                </div>
                            ` : ''}
                        </div>
                        <span class="message-time-new">${time}</span>
                    </div>
                `;
            }
            
            if (chatMessages) {
                chatMessages.appendChild(msgElement);
                requestAnimationFrame(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                });
                
                if (!isMe) {
                    try {
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
                        audio.volume = 0.4;
                        audio.play().catch(() => {});
                    } catch(e) {}
                }
            }
        }

        // Fallback de polling reduzido para 2s (seguro e rápido)
        if (window.ticketChatFallback) clearInterval(window.ticketChatFallback);
        window.ticketChatFallback = setInterval(async () => {
            if (!currentTicket) return;
            const { data } = await supabase.from('ticket_messages')
                .select('id, ticket_id, sender_id, message, attachment_url, is_support, created_at')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: false }).limit(1);
            if (data?.[0] && !document.querySelector(`[data-msg-id="${data[0].id}"]`)) {
                handleNewSupportMessage(data[0]);
            }
        }, 2000);
    }

    // Enviar Mensagem
    if (chatForm) {
        chatForm.onsubmit = async (e) => {
            e.preventDefault();
            const message = chatInput.value.trim();
            const file = fileAttachment.files[0];

            if (!message && !file) return;
            if (!currentTicket) {
                showNotification('Erro: Nenhum ticket selecionado.', 'error');
                return;
            }

            const sendBtn = chatForm.querySelector('.btn-send-message');
            if (sendBtn) sendBtn.disabled = true;

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    showNotification('Você precisa estar logado para enviar mensagens.', 'error');
                    return;
                }

                let attachmentUrl = null;

                if (file) {
                    try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${Math.random()}.${fileExt}`;
                        const filePath = `${user.id}/${fileName}`;

                        const { error: uploadError } = await supabase.storage
                            .from('tickets-attachments')
                            .upload(filePath, file);

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage
                                .from('tickets-attachments')
                                .getPublicUrl(filePath);
                            attachmentUrl = publicUrl;
                        } else {
                            // Fallback simulation if bucket doesn't exist
                            attachmentUrl = await new Promise(resolve => {
                                const reader = new FileReader();
                                reader.onload = e => resolve(e.target.result);
                                reader.readAsDataURL(file);
                            });
                        }
                    } catch (uploadErr) {
                        console.warn('Upload process error:', uploadErr);
                    }
                }

                const { data: savedMsg, error } = await supabase
                    .from('ticket_messages')
                    .insert([{
                        ticket_id: currentTicket.id,
                        sender_id: user.id,
                        message: message,
                        attachment_url: attachmentUrl,
                        is_support: false // No suporte.js (página do cliente) sempre é false
                    }])
                    .select()
                    .single();

                if (error) throw error;

                // Broadcast para latência zero
                if (messageSubscription && savedMsg) {
                    messageSubscription.send({
                        type: 'broadcast',
                        event: 'new_message',
                        payload: savedMsg
                    });
                }

                // Optimistic UI Update: Adicionar a mensagem imediatamente na tela se ainda não estiver lá
                if (savedMsg && !document.querySelector(`[data-msg-id="${savedMsg.id}"]`)) {
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message sent';
                    msgDiv.setAttribute('data-msg-id', savedMsg.id);
                    msgDiv.innerHTML = `
                        ${savedMsg.message ? `<p>${savedMsg.message}</p>` : ''}
                        ${savedMsg.attachment_url ? `
                            <div class="message-attachment">
                                <img src="${savedMsg.attachment_url}" alt="Anexo" onclick="window.open('${savedMsg.attachment_url}', '_blank')">
                            </div>
                        ` : ''}
                        <span class="message-time">${new Date(savedMsg.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                    `;
                    chatMessages.appendChild(msgDiv);
                    requestAnimationFrame(() => {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    });
                }

                chatInput.value = '';
                fileAttachment.value = '';
                if (attachmentPreview) attachmentPreview.style.display = 'none';
                
                // Remover o setTimeout de recarregamento total, o Realtime cuidará disso de forma otimizada
                
            } catch (error) {
                console.error('Erro ao enviar mensagem:', error);
                showNotification('Erro ao enviar mensagem: ' + (error.message || 'Erro desconhecido'), 'error');
            } finally {
                if (sendBtn) sendBtn.disabled = false;
            }
        };
    }

    // Attachment Handlers
    if (fileAttachment) {
        fileAttachment.onchange = () => {
            const file = fileAttachment.files[0];
            if (file) {
                fileNameDisplay.textContent = file.name;
                attachmentPreview.style.display = 'flex';
            }
        };
    }

    if (removeAttachment) {
        removeAttachment.onclick = () => {
            fileAttachment.value = '';
            attachmentPreview.style.display = 'none';
        };
    }

    if (backToList) {
        backToList.onclick = () => {
            closeChatUI();
            views.forEach(v => v.classList.remove('active'));
            document.getElementById('listTicketView').classList.add('active');
        };
    }

    if (closeTicketBtn) {
        closeTicketBtn.onclick = () => {
            console.log('Botão Fechar Ticket clicado. currentTicket:', currentTicket);
            if (confirmOverlay) confirmOverlay.style.display = 'flex';
        };
    }

    if (confirmYes) {
        confirmYes.onclick = async () => {
            if (!currentTicket) {
                console.warn('currentTicket é nulo ao tentar fechar o ticket.');
                return;
            }
            
            const ticketId = currentTicket.id;
            
            try {
                console.log('Deletando ticket:', ticketId);
                // Usar delete para "sumir pra sempre"
                const { error } = await supabase
                    .from('tickets')
                    .delete()
                    .eq('id', ticketId);

                if (error) {
                    console.error('Erro ao deletar ticket no Supabase:', error);
                    throw error;
                }

                // Esconder o overlay imediatamente
                if (confirmOverlay) confirmOverlay.style.display = 'none';
                
                showNotification('Ticket fechado e removido com sucesso!', 'success');
                
                // Limpar o estado do ticket atual
                closeChatUI();

                // Voltar para a lista manualmente para garantir a ordem das operações
                views.forEach(v => v.classList.remove('active'));
                const listView = document.getElementById('listTicketView');
                if (listView) listView.classList.add('active');
                
                // Recarregar a lista de tickets após um pequeno delay para garantir sincronia
                setTimeout(async () => {
                    await loadTickets();
                }, 300);

            } catch (error) {
                console.error('Erro ao fechar ticket:', error);
                showNotification('Erro ao fechar ticket.', 'error');
            }
        };
    }

    if (confirmNo) {
        confirmNo.onclick = () => {
            if (confirmOverlay) confirmOverlay.style.display = 'none';
        };
    }

    if (supportForm) {
        supportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                showNotification('Você precisa estar logado para abrir um ticket.', 'error');
                window.location.href = 'login.html';
                return;
            }

            const formData = new FormData(supportForm);
            const ticketData = {
                user_id: user.id,
                name: formData.get('name'),
                email: formData.get('email'),
                subject: formData.get('subject'),
                message: formData.get('message')
            };

            const submitBtn = supportForm.querySelector('.btn-submit-ticket');
            submitBtn.disabled = true;
            submitBtn.textContent = 'ENVIANDO...';
            
            try {
                const { data, error } = await supabase
                    .from('tickets')
                    .insert([ticketData])
                    .select();

                if (error) throw error;

                // Enviar e-mail de confirmação do ticket
                if (window.sendEmailNotification && data && data[0]) {
                    const tid = data[0].id.substring(0, 8).toUpperCase();
                    window.sendEmailNotification({
                        to_email: ticketData.email,
                        customer_email: ticketData.email,
                        to_name: ticketData.name,
                        customer_name: ticketData.name,
                        ticket_id: tid,
                        subject: `Ticket Aberto: ${ticketData.subject} [#${tid}]`,
                        message: ticketData.message,
                        type: "SUPORTE",
                        description: "Recebemos sua solicitação de suporte! Nossa equipe entrará em contato em breve através deste ticket ou e-mail."
                    });
                }

                // Inserir a mensagem inicial na tabela de mensagens
                if (data && data[0]) {
                    await supabase
                        .from('ticket_messages')
                        .insert([{
                            ticket_id: data[0].id,
                            sender_id: user.id,
                            message: ticketData.message,
                            is_support: false
                        }]);
                }

                showNotification('Seu ticket foi enviado com sucesso!', 'success');
                supportForm.reset();
                
                // Mudar para a aba de lista
                const listTab = document.querySelector('[data-view="list"]');
                if (listTab) listTab.click();
                
                // Recarregar lista
                await loadTickets();
                
                // Opcional: abrir o chat do novo ticket imediatamente
                if (data && data[0]) {
                    openChat(data[0]);
                }
            } catch (error) {
                console.error('Erro ao enviar ticket:', error);
                showNotification('Erro ao enviar ticket. Tente novamente.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'ENVIAR TICKET';
            }
        });
    }

    // Lógica de alternância de abas
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewType = item.getAttribute('data-view');
            const viewId = viewType + 'TicketView';
            
            closeChatUI();

            navItems.forEach(i => i.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            item.classList.add('active');
            const targetView = document.getElementById(viewId);
            if (targetView) targetView.classList.add('active');

            if (viewType === 'list') {
                loadTickets();
            }
        });
    });

    // Botão "Abrir um ticket agora" no estado vazio
    const openTicketBtn = document.getElementById('openTicketNow');
    if (openTicketBtn) {
        openTicketBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const createTab = document.querySelector('[data-view="create"]');
            if (createTab) createTab.click();
        });
    }

    // Carregar tickets inicialmente se a aba de lista estiver ativa
    const activeTab = document.querySelector('.support-nav-item.active');
    if (activeTab && activeTab.getAttribute('data-view') === 'list') {
        loadTickets();
    }
});
