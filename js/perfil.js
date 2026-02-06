document.addEventListener('DOMContentLoaded', async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    // State
    let currentUserIsAdmin = false;
    let currentTicketId = null;
    let currentOrderId = null;
    let orderMessagesSubscription = null;
    let ticketMessagesSubscription = null;
    let adminNamesCache = {};
    let adminRealtimeSub = null;
    let pendingOrdersCount = 0;
    let pendingTicketsCount = 0;

    // Check if user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        window.location.href = 'login.html';
        return;
    }

    // Elements
    const views = document.querySelectorAll('.profile-view');
    const navItems = document.querySelectorAll('.profile-nav-item');
    const displayNameInput = document.getElementById('displayName');
    const displayEmailInput = document.getElementById('displayEmail');
    const profileForm = document.getElementById('profileForm');
    const btnResetPassword = document.getElementById('btnResetPassword');
    const resetEmailInput = document.getElementById('resetEmail');
    const btnSendResetLink = document.getElementById('btnSendResetLink');
    const modal = document.getElementById('resetPasswordModal');

    // Helper for product redirection
    window.redirectToProduct = (name, game, price, image) => {
        const params = new URLSearchParams();
        params.set('name', name);
        params.set('game', game || 'GalaxyBuxx');
        params.set('price', price);
        
        // Fix image path for the pages/ folder
        let finalImage = image || '';
        if (finalImage && !finalImage.startsWith('http') && !finalImage.startsWith('../')) {
            finalImage = '../' + finalImage;
        }
        
        params.set('image', finalImage);
        params.set('stock', '999');
        
        // Check if it's a Robux product to use the correct page
        const isRobux = name.toLowerCase().includes('robux');
        const targetPage = isRobux ? 'pages/robux-details.html' : 'pages/gamepass-detail.html';
        
        window.location.href = `${targetPage}?${params.toString()}`;
    };

    // Logout
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signOut();
            if (error) {
                alert('Erro ao sair: ' + error.message);
            } else {
                window.location.href = 'index.html';
            }
        });
    });

    // Load initial user data
    async function loadUserData(userData) {
        console.log("Loading user data for:", userData.id);
        
        setupUserOrdersRealtime(userData.id);
        
        // Force hide admin item by default
        const adminNavItem = document.getElementById('adminNavItem');
        if (adminNavItem) adminNavItem.classList.add('hidden');
        currentUserIsAdmin = false;

        const metadata = userData.user_metadata || {};
        const name = metadata.full_name || metadata.username || metadata.name || userData.email.split('@')[0];
        const email = userData.email;
        const avatar = metadata.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=222&color=fff&size=128`;
        
        // Update basic UI
        document.querySelectorAll('.user-name-text').forEach(el => el.textContent = name);
        document.querySelectorAll('.user-avatar-img').forEach(el => el.src = avatar);
        if (displayNameInput) displayNameInput.value = name;
        if (displayEmailInput) displayEmailInput.value = email;
        if (resetEmailInput) resetEmailInput.value = email;

        // Check Admin Status from public.users table
        try {
            // Check metadata first (fastest fallback)
            const metadata = userData.user_metadata || {};
            if (metadata.is_admin === true || metadata.role === 'admin') {
                console.log("Admin detected via metadata fallback");
                currentUserIsAdmin = true;
                showAdminUI();
            }

            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('is_admin')
                .eq('id', userData.id)
                .maybeSingle();

            if (profileError) {
                console.error("Database error checking admin status:", profileError);
                
                // FALLBACK: Se o banco der erro de recursão, mas o ID for o seu e você souber que é admin
                // vamos tentar carregar as estatísticas. Se o Supabase permitir a leitura das stats,
                // confirmamos que você é admin de qualquer forma.
                console.log("Attempting admin verification via permissions probe...");
                const { count, error: probeError } = await supabase
                    .from('site_settings')
                    .select('*', { count: 'exact', head: true });
                
                if (!probeError) {
                    console.log("Admin confirmed via permissions probe (site_settings access)");
                    currentUserIsAdmin = true;
                    showAdminUI();
                }
            } else if (profile && (profile.is_admin === true || String(profile.is_admin) === 'true')) {
                console.log("Admin confirmed via database");
                currentUserIsAdmin = true;
                showAdminUI();
            } else {
                console.log("User is not an admin according to database");
            }
        } catch (err) {
            console.error("Critical error in loadUserData:", err);
        }
    }

    function showAdminUI() {
        const adminNavItem = document.getElementById('adminNavItem');
        if (adminNavItem) {
            adminNavItem.classList.remove('hidden');
            adminNavItem.style.setProperty('display', 'flex', 'important');
        }
        initAdminPanel();
        setupAdminRealtime();
        fetchInitialCounts(); // Busca as contagens iniciais de notificações
    }

    async function fetchInitialCounts() {
        try {
            // Conta pedidos aguardando pagamento
            const { count: ordersCount, error: ordersErr } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Aguardando Pagamento');
            
            if (!ordersErr) pendingOrdersCount = ordersCount || 0;

            // Conta tickets pendentes
            const { count: ticketsCount, error: ticketsErr } = await supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .neq('status', 'resolved');

            if (!ticketsErr) pendingTicketsCount = ticketsCount || 0;

            updateBadges();
        } catch (err) {
            console.error("Erro ao buscar contagens iniciais:", err);
        }
    }

    function setupAdminRealtime() {
        if (adminRealtimeSub) return;

        adminRealtimeSub = supabase.channel('admin-notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                const activeTab = document.querySelector('.admin-tab-btn.active')?.getAttribute('data-admin-tab');
                if (activeTab !== 'admin-pedidos') {
                    pendingOrdersCount++;
                    updateBadges();
                } else {
                    loadAdminTabData('admin-pedidos');
                }
                showNotification('Novo pedido recebido!', 'success');
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (payload) => {
                const activeTab = document.querySelector('.admin-tab-btn.active')?.getAttribute('data-admin-tab');
                if (activeTab !== 'admin-tickets') {
                    pendingTicketsCount++;
                    updateBadges();
                } else {
                    loadAdminTabData('admin-tickets');
                }
                showNotification('Novo ticket de suporte aberto!', 'info');
            })
            .subscribe();
    }

    function updateBadges() {
        const orderBadge = document.getElementById('badge-pedidos');
        const ticketBadge = document.getElementById('badge-tickets');

        if (orderBadge) {
            orderBadge.textContent = pendingOrdersCount;
            orderBadge.classList.toggle('hidden', pendingOrdersCount === 0);
        }
        if (ticketBadge) {
            ticketBadge.textContent = pendingTicketsCount;
            ticketBadge.classList.toggle('hidden', pendingTicketsCount === 0);
        }
    }

    // Admin Panel Logic
    function initAdminPanel() {
        const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
        const adminTabContents = document.querySelectorAll('.admin-tab-content');

        adminTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-admin-tab');

                // Clear badges when clicking on the tab
                if (targetId === 'admin-pedidos') {
                    pendingOrdersCount = 0;
                    updateBadges();
                } else if (targetId === 'admin-tickets') {
                    pendingTicketsCount = 0;
                    updateBadges();
                }

                // Update active button
                adminTabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active content
                adminTabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetId) {
                        content.classList.add('active');
                    }
                });

                // Load data for the specific tab
                loadAdminTabData(targetId);
            });
        });

        // Load initial admin data
        loadAdminTabData('admin-pedidos');
    }

    async function loadAdminTabData(tabId) {
        if (!currentUserIsAdmin) return;
        
        if (tabId === 'admin-stats') {
            loadAdminStats();
        } else if (tabId === 'admin-pedidos' || tabId === 'admin-entregas' || tabId === 'admin-comprovantes' || tabId === 'admin-cancelados') {
            let statusFilter = '';
            let tableId = '';
            
            if (tabId === 'admin-pedidos') {
                statusFilter = 'Aguardando Pagamento';
                tableId = 'adminOrdersTable';
            } else if (tabId === 'admin-entregas') {
                statusFilter = 'Em Andamento';
                tableId = 'adminDeliveriesTable';
            } else if (tabId === 'admin-comprovantes') {
                statusFilter = 'Concluído';
                tableId = 'adminProofsTable';
            } else {
                statusFilter = 'Cancelado';
                tableId = 'adminCancelledTable';
            }

            const container = document.getElementById(tableId);
            if (!container) return;

            // 1. Buscar os pedidos
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('status', statusFilter)
                .order('created_at', { ascending: false });

            if (ordersError) {
                console.error("Erro ao carregar pedidos:", ordersError);
                container.innerHTML = `<div class="empty-table">Erro ao carregar pedidos: ${ordersError.message}</div>`;
                return;
            }

            if (!orders || orders.length === 0) {
                const msg = tabId === 'admin-pedidos' ? 'Nenhum pedido aguardando pagamento.' : 
                            tabId === 'admin-entregas' ? 'Nenhum pedido em andamento.' :
                            tabId === 'admin-comprovantes' ? 'Nenhum pedido concluído.' : 'Nenhum pedido cancelado.';
                container.innerHTML = `<div class="empty-table">${msg}</div>`;
                return;
            }

            // 2. Coletar IDs de usuários únicos e buscar seus dados
            const userIds = [...new Set(orders.map(o => o.user_id).filter(id => id))];
            let userMap = {};

            if (userIds.length > 0) {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('id, username, email')
                    .in('id', userIds);
                
                if (userData) {
                    userData.forEach(u => {
                        userMap[u.id] = u;
                    });
                }
            }

            // 3. Renderizar a lista unindo os dados
            container.innerHTML = orders.map(order => {
                const user = userMap[order.user_id];
                const orderIdStr = order.id.substring(0, 8).toUpperCase();
                const displayName = user?.username || order.customer_name || 'Usuário s/ nome';
                const displayEmail = user?.email || order.customer_contact || 'Sem email';
                const date = new Date(order.created_at).toLocaleString('pt-BR');

                // Safer parameters for onclick
                const nameEsc = order.product_name.replace(/'/g, "\\'");
                const gameEsc = (order.product_game || '').replace(/'/g, "\\'");
                const imgEsc = (order.product_image || '').replace(/'/g, "\\'");
                const unitPrice = order.total_price / order.quantity;

                // Logic for "Robux Personalizado" in Admin
                const isRobux = order.product_name.toLowerCase().includes('robux');
                const adminSubtext = isRobux ? '<div class="admin-game-subtext">Robux Personalizado</div>' : (order.product_game ? `<div class="admin-game-subtext">${order.product_game}</div>` : '');

                return `
                <div class="order-card-admin-new">
                    <div class="admin-card-row-1">
                        <div class="admin-customer-info">
                            <i class="fa-solid fa-circle-user"></i>
                            <strong>${displayName}</strong>
                            <span>(${displayEmail})</span>
                        </div>
                        <div class="admin-date-info">${date}</div>
                    </div>

                    <div class="admin-card-row-2">
                        <div class="admin-product-details">
                            <span class="admin-order-id">#${orderIdStr}</span>
                            <div class="admin-product-name-wrapper">
                                <span class="admin-product-name-new" onclick="redirectToProduct('${nameEsc}', '${gameEsc}', '${unitPrice}', '${imgEsc}')">${order.product_name}</span>
                                ${adminSubtext}
                            </div>
                            <span class="admin-product-qty">x${order.quantity}</span>
                        </div>
                        <div class="admin-price-box">
                            <span class="admin-price-label">Valor Total</span>
                            <span class="admin-price-value">R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</span>
                        </div>
                    </div>

                    <div class="admin-card-row-3">
                        <div class="admin-status-controls">
                            <select class="status-select-admin-new" onchange="updateOrderStatus('${order.id}', this.value)">
                                <option value="Aguardando Pagamento" ${order.status === 'Aguardando Pagamento' ? 'selected' : ''}>Aguardando Pagamento</option>
                                <option value="Em Andamento" ${order.status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option>
                                <option value="Concluído" ${order.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                                <option value="Cancelado" ${order.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                            </select>
                            <button class="btn-admin-chat-new" onclick="openOrderChat('${order.id}')">
                                <i class="fa-solid fa-comments"></i> Abrir Chat
                            </button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } else if (tabId === 'admin-tickets') {
            const ticketList = document.getElementById('adminTicketsList');
            if (!ticketList) return;

            const { data: tickets, error } = await supabase
                .from('tickets')
                .select('*')
                .neq('status', 'resolved')
                .order('created_at', { ascending: false });

            if (error) {
                ticketList.innerHTML = `<div class="empty-table">Erro ao carregar tickets.</div>`;
                return;
            }

            if (!tickets || tickets.length === 0) {
                ticketList.innerHTML = `<div class="empty-table">Nenhum ticket encontrado.</div>`;
                return;
            }

            ticketList.innerHTML = tickets.map(ticket => `
                <div class="ticket-item ${currentTicketId === ticket.id ? 'active' : ''}" onclick="openTicket('${ticket.id}')">
                    <h5>${ticket.subject}</h5>
                    <p>${ticket.email}</p>
                    <p class="ticket-preview" style="font-size: 0.7rem; color: #888; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ticket.message || ''}</p>
                    <div class="ticket-meta">
                        <span class="status-badge ${ticket.status}">${ticket.status}</span>
                        <span class="message-time">${new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `).join('');
        } else if (tabId === 'admin-usuarios') {
            const tbody = document.getElementById('adminUsersTable');
            if (!tbody) return;

            const { data: admins, error } = await supabase
                .from('users')
                .select('*')
                .eq('is_admin', true)
                .order('created_at', { ascending: false });

            if (error || !admins) {
                tbody.innerHTML = `<tr><td colspan="6" class="empty-table">Erro ao carregar administradores.</td></tr>`;
                return;
            }

            tbody.innerHTML = admins.map(admin => {
                const adminDisplayName = (admin.full_name || admin.email || 'Admin').replace(/'/g, "\\'");
                return `
                <tr>
                    <td>${admin.full_name || 'Admin'}</td>
                    <td>${admin.email}</td>
                    <td><span class="admin-badge" style="margin:0; padding:4px 8px; font-size:0.65rem;">ADMIN</span></td>
                    <td>-</td>
                    <td><span class="status-badge active">Ativo</span></td>
                    <td>
                        <button class="btn-action-table" onclick="openAdminStats('${admin.id}', '${adminDisplayName}')">
                            <i class="fa-solid fa-chart-simple"></i> Ver
                        </button>
                    </td>
                </tr>
            `;}).join('');
        } else if (tabId === 'admin-config') {
            loadConfigData();
        }
    }

    async function loadConfigData() {
        const { data: settings } = await supabase
            .from('site_settings')
            .select('*');
        
        const toggle = document.getElementById('storeOpenToggle');
        if (settings && toggle) {
            const storeSetting = settings.find(s => s.key === 'store_open')?.value;
            
            if (storeSetting === 'true') {
                toggle.checked = true;
            } else if (storeSetting === 'false') {
                toggle.checked = false;
            } else {
                // Auto mode - calculate based on time
                const hour = new Date().getHours();
                toggle.checked = hour >= 12 && hour < 24;
            }
        }
    }

    const storeOpenToggle = document.getElementById('storeOpenToggle');
    storeOpenToggle?.addEventListener('change', async (e) => {
        const isOpen = e.target.checked;
        const { error } = await supabase
            .from('site_settings')
            .upsert({ key: 'store_open', value: String(isOpen), updated_at: new Date().toISOString() });
        
        if (error) {
            alert('Erro ao atualizar status da loja: ' + error.message);
            e.target.checked = !isOpen;
        }
    });

    // Admin Stats Detail Modal Logic
    let adminDetailChart = null;

    window.openAdminStats = async (adminId, adminName) => {
        const modal = document.getElementById('adminStatsModal');
        if (modal) modal.style.display = 'flex';
        
        document.getElementById('modalAdminName').textContent = `Estatísticas de ${adminName}`;
        
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // Fetch Stats
        const { data: stats } = await supabase
            .from('orders')
            .select('total_price, created_at, status')
            .eq('handled_by', adminId);

        if (!stats) return;

        const salesToday = stats
            .filter(o => o.created_at >= todayStart && o.status !== 'Cancelado')
            .reduce((acc, curr) => acc + parseFloat(curr.total_price), 0);
        
        const sales7D = stats
            .filter(o => o.created_at >= weekStart && o.status !== 'Cancelado')
            .reduce((acc, curr) => acc + parseFloat(curr.total_price), 0);
            
        const salesMonth = stats
            .filter(o => o.created_at >= monthStart && o.status !== 'Cancelado')
            .reduce((acc, curr) => acc + parseFloat(curr.total_price), 0);
            
        const totalSold = stats
            .filter(o => o.status !== 'Cancelado')
            .reduce((acc, curr) => acc + parseFloat(curr.total_price), 0);
            
        const totalAttended = stats.length;

        document.getElementById('modalAdminSalesToday').textContent = `R$ ${salesToday.toFixed(2).replace('.', ',')}`;
        document.getElementById('modalAdminSales7D').textContent = `R$ ${sales7D.toFixed(2).replace('.', ',')}`;
        document.getElementById('modalAdminSalesMonth').textContent = `R$ ${salesMonth.toFixed(2).replace('.', ',')}`;
        document.getElementById('modalAdminTotalSold').textContent = `R$ ${totalSold.toFixed(2).replace('.', ',')}`;
        document.getElementById('modalAdminAttended').textContent = totalAttended;

        // Chart for admin detail
        const grouped = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            grouped[dateStr] = 0;
        }

        stats.filter(o => o.created_at >= weekStart && o.status !== 'Cancelado').forEach(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (grouped[dateStr] !== undefined) grouped[dateStr] += parseFloat(order.total_price);
        });

        const labels = Object.keys(grouped).reverse();
        const values = Object.values(grouped).reverse();

        const ctx = document.getElementById('adminDetailChart').getContext('2d');
        if (adminDetailChart) adminDetailChart.destroy();
        
        adminDetailChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Vendas (R$)',
                    data: values,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: '#ffffff',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    };

    window.closeAdminStatsModal = () => {
        const modal = document.getElementById('adminStatsModal');
        if (modal) modal.style.display = 'none';
    };

    // Ticket Chat Functions
    window.openTicket = async (ticketId) => {
        currentTicketId = ticketId;
        
        // UI updates
        document.querySelectorAll('.ticket-item').forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`.ticket-item[onclick="openTicket('${ticketId}')"]`);
        if (activeItem) activeItem.classList.add('active');

        document.getElementById('noTicketSelected').classList.add('hidden');
        document.getElementById('adminTicketChat').classList.remove('hidden');

        // Fetch ticket details
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (ticket) {
            document.getElementById('chatTicketSubject').textContent = ticket.subject;
            document.getElementById('chatTicketCustomer').textContent = `Cliente: ${ticket.email}`;
            
            const statusBadge = document.getElementById('chatTicketStatusBadge');
            if (statusBadge) {
                statusBadge.textContent = ticket.status === 'pending' ? 'Pendente' : ticket.status;
                statusBadge.className = `status-badge ${ticket.status}`;
            }
            
            // Load messages
            loadTicketMessages(ticketId);
            setupTicketMessagesRealtime(ticketId);
        }
    };

    function setupTicketMessagesRealtime(ticketId) {
        if (ticketMessagesSubscription) {
            supabase.removeChannel(ticketMessagesSubscription);
        }

        ticketMessagesSubscription = supabase.channel(`ticket_chat_admin_${ticketId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'ticket_messages'
        }, (payload) => {
            if (String(payload.new.ticket_id) === String(ticketId)) {
                handleNewAdminTicketMessage(payload.new);
            }
        })
        .on('broadcast', { event: 'new_message' }, (payload) => {
            if (payload.payload && String(payload.payload.ticket_id) === String(ticketId)) {
                handleNewAdminTicketMessage(payload.payload);
            }
        })
        .subscribe();

        function handleNewAdminTicketMessage(newMessage) {
            if (document.querySelector(`[data-chat-msg-id="${newMessage.id}"]`)) return;

            const messagesDiv = document.getElementById('adminChatMessages');
            if (!messagesDiv) return;

            const isMe = newMessage.sender_id === user.id;
            const time = new Date(newMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const msgElement = document.createElement('div');
            msgElement.setAttribute('data-chat-msg-id', newMessage.id);

            if (isMe) {
                // Estilo Clássico (Balão Branco)
                msgElement.className = 'message sent';
                msgElement.style.alignSelf = 'flex-end'; // Garantir que vai pra direita no admin
                msgElement.innerHTML = `
                    ${newMessage.message ? `<p>${newMessage.message}</p>` : ''}
                    ${newMessage.attachment_url ? `
                        <div class="message-attachment">
                            <img src="${newMessage.attachment_url}" alt="Anexo" onclick="openLightbox('${newMessage.attachment_url}')">
                        </div>
                    ` : ''}
                    <span class="message-time">${time}</span>
                `;
            } else {
                // Estilo Oposto (Avatar + Nome)
                const msgFromAdmin = newMessage.is_support;
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
                                    <img src="${newMessage.attachment_url}" alt="Anexo" onclick="openLightbox('${newMessage.attachment_url}')">
                                </div>
                            ` : ''}
                        </div>
                        <span class="message-time-new">${time}</span>
                    </div>
                `;
            }

            messagesDiv.appendChild(msgElement);
            requestAnimationFrame(() => {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            });

            if (!isMe) {
                try {
                    new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3').play().catch(() => {});
                } catch(e) {}
            }
        }

        // Fallback redundante para tickets (admin)
        if (window.adminTicketFallback) clearInterval(window.adminTicketFallback);
        window.adminTicketFallback = setInterval(async () => {
            if (currentTicketId === ticketId) {
                const { data } = await supabase
                    .from('ticket_messages')
                    .select('id, ticket_id, sender_id, message, is_support, created_at')
                    .eq('ticket_id', ticketId)
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (data && data.length > 0) {
                    handleNewAdminTicketMessage(data[0]);
                }
            } else {
                clearInterval(window.adminTicketFallback);
            }
        }, 800);
    }

    async function loadTicketMessages(ticketId) {
        const messagesDiv = document.getElementById('adminChatMessages');
        if (!messagesDiv) return;

        const { data: messages, error } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (!error && messages) {
            const { data: { user } } = await supabase.auth.getUser();
            messagesDiv.innerHTML = messages.map(msg => {
                const isMe = msg.sender_id === user?.id;
                const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                if (isMe) {
                    return `
                        <div class="message sent" style="align-self: flex-end;" data-chat-msg-id="${msg.id}">
                            <div class="message-bubble">
                                ${msg.message ? `<p>${msg.message}</p>` : ''}
                                ${msg.attachment_url ? `
                                    <div class="message-attachment">
                                        <img src="${msg.attachment_url}" alt="Anexo" onclick="openLightbox('${msg.attachment_url}')">
                                    </div>
                                ` : ''}
                            </div>
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                } else {
                    const msgFromAdmin = msg.is_support;
                    let senderName = msgFromAdmin ? "Suporte GalaxyBuxx" : "Cliente";
                    let avatarUrl = msgFromAdmin 
                        ? `https://ui-avatars.com/api/?name=S&background=00d2ff&color=fff`
                        : `https://ui-avatars.com/api/?name=C&background=111&color=fff`;

                    return `
                        <div class="message-wrapper theirs ${msgFromAdmin ? 'admin-msg' : ''}" data-chat-msg-id="${msg.id}">
                            <div class="message-avatar">
                                <img src="${avatarUrl}" alt="Avatar">
                            </div>
                            <div class="message-bundle">
                                <span class="message-sender-name">${senderName}</span>
                                <div class="message-bubble">
                                    ${msg.message ? `<p>${msg.message}</p>` : ''}
                                    ${msg.attachment_url ? `
                                        <div class="message-attachment">
                                            <img src="${msg.attachment_url}" alt="Anexo" onclick="openLightbox('${msg.attachment_url}')">
                                        </div>
                                    ` : ''}
                                </div>
                                <span class="message-time-new">${time}</span>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            
            requestAnimationFrame(() => {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            });
        }
    }

    // Attach preview for Admin Ticket
    document.getElementById('adminChatFile')?.addEventListener('change', function() {
        const icon = document.getElementById('adminAttachIcon');
        const preview = document.getElementById('adminAttachPreview');
        if (this.files && this.files.length > 0) {
            const file = this.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
                if (icon) icon.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // Send Message Form Admin Ticket
    document.getElementById('adminChatForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('adminChatMessageInput');
        const fileInput = document.getElementById('adminChatFile');
        const btnSend = document.getElementById('btnSendAdminMessage');
        const message = input.value.trim();
        const file = fileInput.files[0];

        if ((!message && !file) || !currentTicketId) return;

        if (btnSend) btnSend.disabled = true;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            let attachmentUrl = null;
            
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                const filePath = `ticket-attachments/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('tickets-attachments')
                    .upload(filePath, file);

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('tickets-attachments')
                        .getPublicUrl(filePath);
                    attachmentUrl = publicUrl;
                }
            }

            const { error, data: newMsg } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: currentTicketId,
                    sender_id: user.id,
                    message: message,
                    attachment_url: attachmentUrl,
                    is_support: true
                })
                .select()
                .single();

            if (!error && newMsg) {
                input.value = '';
                fileInput.value = '';
                const icon = document.getElementById('adminAttachIcon');
                const preview = document.getElementById('adminAttachPreview');
                if (icon) icon.style.display = 'block';
                if (preview) { preview.src = ''; preview.style.display = 'none'; }
                
                if (ticketMessagesSubscription) {
                    ticketMessagesSubscription.send({
                        type: 'broadcast',
                        event: 'new_message',
                        payload: newMsg
                    });
                }
                // Update UI immediately for zero latency
                handleNewAdminTicketMessage(newMsg);
            }
        } catch (err) {
            console.error('Erro ao enviar msg admin:', err);
        } finally {
            if (btnSend) btnSend.disabled = false;
        }
    });

    // Function to update status in DB
    window.updateOrderStatus = async (orderId, newStatus) => {
        try {
            // Primeiro busca o e-mail do cliente para notificar
            const { data: orderData, error: fetchErr } = await supabase
                .from('orders')
                .select('user_id, product_name, customer_name, customer_contact')
                .eq('id', orderId)
                .single();

            const { error } = await supabase
                .from('orders')
                .update({ status: newStatus })
                .eq('id', orderId);

            if (error) throw error;

            window.showNotification('Status do pedido atualizado!', 'success');

            // Notificar cliente por e-mail
            if (orderData) {
                let targetEmail = orderData.customer_contact;
                if (orderData.user_id) {
                    const { data: ud } = await supabase.from('users').select('email').eq('id', orderData.user_id).single();
                    if (ud?.email) targetEmail = ud.email;
                }
                
                window.sendEmailNotification({
                    to_email: targetEmail,
                    to_name: orderData.customer_name,
                    subject: `Status Atualizado: ${newStatus} [#${orderId.substring(0, 8).toUpperCase()}]`,
                    description: `O status do seu pedido foi atualizado para: **${newStatus}**.`
                });
            }

            // Refresh current tab
            const activeAdminTab = document.querySelector('.admin-tab-btn.active')?.getAttribute('data-admin-tab');
            if (activeAdminTab) loadAdminTabData(activeAdminTab);
            
            // If on user view, refresh too
            loadUserOrders();
        } catch (err) {
            console.error('Erro ao atualizar status:', err);
            window.showNotification('Erro ao atualizar status: ' + err.message, 'error');
        }
    };

    let currentOrderFilter = 'ativos';

    function setupUserOrdersRealtime(userId) {
        supabase.channel(`user-orders-${userId}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'orders',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log("Order updated:", payload.new);
                loadUserOrders(); // Reload the list when any order changes
                
                // If the current chat is open for this order, update it too
                if (currentOrderId === payload.new.id) {
                    const statusEl = document.getElementById('chatOrderStatus');
                    if (statusEl) {
                        statusEl.textContent = payload.new.status;
                        statusEl.className = `order-status-badge ${payload.new.status.toLowerCase().replace(/ /g, '-')}`;
                    }
                }
            })
            .subscribe();
    }

    // Load User Orders
    async function loadUserOrders() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase.from('orders').select('*').eq('user_id', user.id);

        if (currentOrderFilter === 'ativos') {
            query = query.neq('status', 'Concluído').neq('status', 'Cancelado');
        } else if (currentOrderFilter === 'concluidos') {
            query = query.eq('status', 'Concluído');
        } else if (currentOrderFilter === 'cancelados') {
            query = query.eq('status', 'Cancelado');
        }

        const { data: orders, error } = await query.order('created_at', { ascending: false });

        const container = document.getElementById('ordersListContainer');
        if (!container) return;

        if (error || !orders || orders.length === 0) {
            container.innerHTML = `<div class="empty-table">Nenhum pedido encontrado nesta categoria.</div>`;
            return;
        }

        container.innerHTML = orders.map(order => {
            const date = new Date(order.created_at);
            const formattedDate = date.toLocaleString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit', 
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '');

            let displayStatus = order.status;
            if (order.status === 'Em Andamento') displayStatus = 'Pendente';
            if (order.status === 'Concluído') displayStatus = 'Entregue';

            const statusClass = order.status.toLowerCase().replace(/ /g, '-');
            const canChat = order.status === 'Em Andamento' || order.status === 'Concluído';
            const showCancelBtn = order.status === 'Aguardando Pagamento';

            // Safer parameters for onclick
            const nameEsc = order.product_name.replace(/'/g, "\\'");
            const gameEsc = (order.product_game || '').replace(/'/g, "\\'");
            const imgEsc = (order.product_image || '').replace(/'/g, "\\'");
            const unitPrice = order.total_price / order.quantity;

            // Logic for "Robux Personalizado"
            const isRobux = order.product_name.toLowerCase().includes('robux');
            const subtext = isRobux ? 'Robux Personalizado' : (order.product_game || 'GalaxyBuxx');

            return `
            <div class="order-card-new">
                <div class="order-card-header-new">
                    <span>Compra <strong>#${order.id.substring(0, 8).toUpperCase()}</strong></span>
                    ${showCancelBtn ? `<button class="btn-cancel-order" onclick="cancelOrder('${order.id}')"><i class="fa-solid fa-xmark"></i> Cancelar</button>` : ''}
                </div>
                
                <div class="order-card-middle-new">
                    <div class="order-product-info-new">
                        <span class="order-qty-new">${order.quantity}x</span>
                        <span class="order-divider-new">|</span>
                        <div class="order-product-name-wrapper">
                            <span class="order-product-name-new" onclick="redirectToProduct('${nameEsc}', '${gameEsc}', '${unitPrice}', '${imgEsc}')">${order.product_name}</span>
                            <span class="order-game-name-new">${subtext}</span>
                        </div>
                    </div>
                    
                    <div class="order-price-new">
                        R$ ${parseFloat(order.total_price / order.quantity).toFixed(2).replace('.', ',')}
                    </div>

                    <button class="btn-ver-pedido" ${canChat ? `onclick="openOrderChat('${order.id}')"` : 'disabled title="Aguardando confirmação"'}>
                        ${canChat ? 'Ver pedido' : 'Pendente'}
                    </button>
                </div>

                <div class="order-card-footer-new">
                    <div class="order-footer-item">
                        ${formattedDate}
                    </div>
                    <div class="order-footer-item">
                        Subtotal: <strong>R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <div class="order-footer-item">
                        <span class="order-status-new ${statusClass}">${displayStatus}</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        // Statistics should always count total regardless of filter
        const { data: allOrders } = await supabase.from('orders').select('total_price, status').eq('user_id', user.id);
        if (allOrders) {
            const paidOrders = allOrders.filter(o => o.status !== 'Cancelado' && o.status !== 'Aguardando Pagamento');
            const totalSpent = paidOrders.reduce((acc, o) => acc + parseFloat(o.total_price), 0);
            document.querySelector('.stats-card h3').textContent = `R$ ${totalSpent.toFixed(2).replace('.', ',')}`;
        }
        document.getElementById('orderCount').textContent = `${orders.length} PEDIDO(S) ENCONTRADO(S)`;
    }

    // Filter Buttons logic
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentOrderFilter = btn.getAttribute('data-filter');
            loadUserOrders();
        });
    });

    // Refresh Button logic
    const btnRefreshUser = document.getElementById('refreshOrders');
    if (btnRefreshUser) {
        btnRefreshUser.addEventListener('click', async () => {
            btnRefreshUser.classList.add('refreshing');
            await loadUserOrders();
            setTimeout(() => {
                btnRefreshUser.classList.remove('refreshing');
            }, 500);
        });
    }

    window.cancelOrder = async (orderId) => {
        if (!confirm('Tem certeza que deseja cancelar este pedido?')) return;

        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'Cancelado' })
                .eq('id', orderId);

            if (error) throw error;

            showNotification('Pedido cancelado com sucesso!', 'success');
            loadUserOrders(); // Refresh the list
        } catch (err) {
            console.error('Erro ao cancelar pedido:', err);
            showNotification('Erro ao cancelar pedido. Tente novamente.', 'error');
        }
    };

    window.openOrderChat = async (orderId) => {
        currentOrderId = orderId;
        const modal = document.getElementById('orderChatModal');
        if (!modal) return;

        // Fetch order details
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) return;

        // Update UI
        document.getElementById('chatOrderId').textContent = `#${order.id.substring(0, 8).toUpperCase()}`;
        document.getElementById('chatOrderImg').src = order.product_image;
        document.getElementById('chatOrderName').textContent = order.product_name;
        document.getElementById('chatOrderGame').textContent = order.product_game;
        document.getElementById('chatOrderQty').textContent = order.quantity;
        
        const statusEl = document.getElementById('chatOrderStatus');
        statusEl.textContent = order.status;
        statusEl.className = `order-status-badge ${order.status.toLowerCase().replace(/ /g, '-')}`;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        document.documentElement.style.overflow = 'hidden'; 
        loadOrderMessages(orderId);
        setupOrderMessagesRealtime(orderId);
    };

    // Close modal logic
    const closeChat = () => {
        const modal = document.getElementById('orderChatModal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scroll
        document.documentElement.style.overflow = '';
        if (orderMessagesSubscription) {
            supabase.removeChannel(orderMessagesSubscription);
            orderMessagesSubscription = null;
        }
        if (window.orderChatFallback) clearInterval(window.orderChatFallback);
    };

    const closeBtn = document.getElementById('closeOrderChat');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeChat);
    }

    const orderModal = document.getElementById('orderChatModal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) closeChat();
        });
    }

    async function loadOrderMessages(orderId) {
        const container = document.getElementById('orderChatMessages');
        if (!container) return;

        const { data: messages, error } = await supabase
            .from('order_messages')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        if (error) return;

        // Fetch names for admins if not in cache
        const adminIds = [...new Set(messages.filter(m => m.is_support).map(m => m.sender_id))];
        const missingIds = adminIds.filter(id => !adminNamesCache[id]);
        
        if (missingIds.length > 0) {
            const { data: admins } = await supabase
                .from('users')
                .select('id, full_name')
                .in('id', missingIds);
            
            if (admins) {
                admins.forEach(a => {
                    adminNamesCache[a.id] = a.full_name || 'Admin';
                });
            }
        }

        renderMessages(messages);
    }

    function renderMessages(messages) {
        const container = document.getElementById('orderChatMessages');
        if (!container || !user) return;
        
        const currentUserId = user.id;

        const welcome = `
            <div class="chat-welcome-msg">
                <i class="fa-solid fa-comments"></i>
                <h4>Chat do Pedido</h4>
                <p>Utilize este chat para combinar os detalhes com o vendedor.</p>
            </div>
        `;

        // Cache for avatars
        if (!window.chatAvatarsCache) window.chatAvatarsCache = {};

        container.innerHTML = welcome + messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgFromAdmin = msg.is_support;
            
            let senderName = "";
            let avatarUrl = "";

            if (isMe) {
                senderName = "Você";
                const meta = user.user_metadata || {};
                avatarUrl = meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=111&color=fff`;
            } else if (msgFromAdmin) {
                senderName = "Admin";
                avatarUrl = `https://ui-avatars.com/api/?name=Admin&background=fff&color=000`;
            } else {
                senderName = "Vendedor"; // Or Cliente depending on who is viewing
                avatarUrl = `https://ui-avatars.com/api/?name=V&background=222&color=fff`;
            }

            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="message-wrapper ${isMe ? 'mine' : 'theirs'}" data-msg-id="${msg.id}">
                    <div class="message-avatar">
                        <img src="${avatarUrl}" alt="Avatar">
                    </div>
                    <div class="message-bundle">
                        <span class="message-sender-name">${senderName}</span>
                        <div class="message-bubble">
                            ${msg.message ? `<p>${msg.message}</p>` : ''}
                            ${msg.attachment_url ? `<img src="${msg.attachment_url}" class="message-attachment" onclick="openLightbox('${msg.attachment_url}')">` : ''}
                        </div>
                        <span class="message-time-new">${time}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function setupOrderMessagesRealtime(orderId) {
        if (orderMessagesSubscription) {
            supabase.removeChannel(orderMessagesSubscription);
        }

        // Canal único por pedido para Broadcast + Postgres
        orderMessagesSubscription = supabase.channel(`order_chat_${orderId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'order_messages'
        }, (payload) => {
            // Filtro manual no JS é mais garantido que o filtro do Realtime
            if (String(payload.new.order_id) === String(orderId)) {
                handleNewOrderMessage(payload.new);
            }
        })
        .on('broadcast', { event: 'new_message' }, (payload) => {
            if (payload.payload && String(payload.payload.order_id) === String(orderId)) {
                handleNewOrderMessage(payload.payload);
            }
        })
        .subscribe((status) => {
            console.log(`Realtime Order ${orderId} Status:`, status);
        });

        function handleNewOrderMessage(newMessage) {
            if (!newMessage || !newMessage.id) return;
            
            // Evitar duplicidade absoluta
            if (document.querySelector(`[data-msg-id="${newMessage.id}"]`)) return;

            const container = document.getElementById('orderChatMessages');
            if (!container) return;

            // Garantir que temos o usuário atual
            const currentUserId = user ? user.id : null;
            const isMe = newMessage.sender_id === currentUserId;
            const msgFromAdmin = newMessage.is_support;
            
            let senderName = "";
            let avatarUrl = "";

            if (isMe) {
                senderName = "Você";
                const meta = user.user_metadata || {};
                avatarUrl = meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=222&color=fff`;
            } else if (msgFromAdmin) {
                senderName = adminNamesCache[newMessage.sender_id] || "Suporte GalaxyBuxx";
                avatarUrl = `https://ui-avatars.com/api/?name=Admin&background=007bff&color=fff`;
            } else {
                senderName = "Cliente";
                avatarUrl = `https://ui-avatars.com/api/?name=C&background=222&color=fff`;
            }

            const time = new Date(newMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const msgDiv = document.createElement('div');
            msgDiv.className = `message-wrapper ${isMe ? 'mine' : 'theirs'}`;
            msgDiv.setAttribute('data-msg-id', newMessage.id);
            msgDiv.innerHTML = `
                <div class="message-avatar">
                    <img src="${avatarUrl}" alt="Avatar">
                </div>
                <div class="message-bundle">
                    <span class="message-sender-name">${senderName}</span>
                    <div class="message-bubble">
                        ${newMessage.message ? `<p>${newMessage.message}</p>` : ''}
                        ${newMessage.attachment_url ? `<img src="${newMessage.attachment_url}" class="message-attachment" onclick="openLightbox('${newMessage.attachment_url}')">` : ''}
                    </div>
                    <span class="message-time-new">${time}</span>
                </div>
            `;

            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
            
            if (!isMe) {
                try {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
                    audio.play().catch(() => {});
                } catch(e) {}
            }
        }
            
        // Fallback redundante agressivo (500ms) - Se o Realtime falhar, isso salva
        if (window.orderChatFallback) clearInterval(window.orderChatFallback);
        window.orderChatFallback = setInterval(async () => {
            const modal = document.getElementById('orderChatModal');
            if (modal && modal.style.display === 'flex') {
                const { data: lastMsgs } = await supabase
                    .from('order_messages')
                    .select('id, order_id, sender_id, message, attachment_url, is_support, created_at')
                    .eq('order_id', orderId)
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (lastMsgs && lastMsgs.length > 0) {
                    const lastMsg = lastMsgs[0];
                    if (!document.querySelector(`[data-msg-id="${lastMsg.id}"]`)) {
                        handleNewOrderMessage(lastMsg);
                    }
                }
            } else {
                clearInterval(window.orderChatFallback);
            }
        }, 500);
    }

    // Ao enviar mensagem, não recarregar tudo se o realtime estiver ativo
    async function sendOrderMessage() {
        const input = document.getElementById('orderChatMessageInput');
        const fileInput = document.getElementById('orderChatFile');
        const btnSend = document.getElementById('btnSendOrderMessage');
        const message = input.value.trim();
        const file = fileInput.files[0];

        if (!currentOrderId || (!message && !file)) return;

        btnSend.disabled = true;
        btnSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            let attachmentUrl = null;
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                const filePath = `order-attachments/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('attachments')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('attachments')
                    .getPublicUrl(filePath);
                
                attachmentUrl = publicUrl;
            }

            const { data: newMsg, error } = await supabase
                .from('order_messages')
                .insert({
                    order_id: currentOrderId,
                    sender_id: user.id,
                    message: message,
                    attachment_url: attachmentUrl,
                    is_support: currentUserIsAdmin
                })
                .select()
                .single();

            if (error) throw error;

            // Enviar via Broadcast para latência 0 (0.1ms)
            if (orderMessagesSubscription) {
                orderMessagesSubscription.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: newMsg
                });
            }

            // Sucesso: limpar inputs
            input.value = '';
            fileInput.value = '';
            
            // Reset preview
            const attachIcon = document.getElementById('attachIcon');
            const attachPreview = document.getElementById('attachPreview');
            if (attachIcon) attachIcon.style.display = 'block';
            if (attachPreview) {
                attachPreview.style.display = 'none';
                attachPreview.src = '';
            }

            // O realtime cuidará de adicionar a mensagem na tela
            // mas como garantia de "0,1ms", podemos adicionar manualmente se o realtime demorar
            if (newMsg && !document.querySelector(`[data-msg-id="${newMsg.id}"]`)) {
                const container = document.getElementById('orderChatMessages');
                if (container) {
                    const msgDiv = document.createElement('div');
                    msgDiv.className = `message-wrapper mine`;
                    msgDiv.setAttribute('data-msg-id', newMsg.id);
                    msgDiv.innerHTML = `
                        <div class="message-bundle">
                            <div class="message-bubble">
                                ${newMsg.message ? `<p>${newMsg.message}</p>` : ''}
                                ${newMsg.attachment_url ? `<img src="${newMsg.attachment_url}" class="message-attachment" onclick="openLightbox('${newMsg.attachment_url}')">` : ''}
                            </div>
                            <span class="message-time-new">${new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    `;
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;
                }
            }

            if (currentUserIsAdmin) {
                await supabase.from('orders').update({ handled_by: user.id }).eq('id', currentOrderId);
            }

        } catch (err) {
            console.error('Erro no chat:', err);
            window.showNotification('Erro ao enviar: ' + err.message, 'error');
        } finally {
            btnSend.disabled = false;
            btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
    }

    // File selection feedback
    document.getElementById('orderChatFile')?.addEventListener('change', function() {
        const icon = document.getElementById('attachIcon');
        const preview = document.getElementById('attachPreview');
        
        if (this.files && this.files.length > 0) {
            const file = this.files[0];
            const reader = new FileReader();
            
            reader.onload = (e) => {
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                }
                if (icon) icon.style.display = 'none';
            };
            
            reader.readAsDataURL(file);
        } else {
            if (icon) icon.style.display = 'block';
            if (preview) {
                preview.style.display = 'none';
                preview.src = '';
            }
        }
    });

    document.getElementById('btnSendOrderMessage')?.addEventListener('click', sendOrderMessage);
    document.getElementById('orderChatMessageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendOrderMessage();
    });

    // Initialize in order
    try {
        // 1. Check admin status first as it's most important
        await loadUserData(user);
        
        // 2. Load orders after
        await loadUserOrders();
    } catch (err) {
        console.error("Error during profile initialization:", err);
    }

    // Tab switching
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.getAttribute('data-tab');
            
            // Prevent unauthorized admin tab access
            if (tab === 'admin' && !currentUserIsAdmin) {
                return;
            }
            
            // Update active nav
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update visible view
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === `${tab}View`) {
                    view.classList.add('active');
                }
            });

            // Update URL for persistence
            const url = new URL(window.location);
            url.searchParams.set('tab', tab);
            window.history.pushState({}, '', url);
        });
    });

    // Check for tab in URL
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab');
    if (initialTab) {
        const targetNav = document.querySelector(`.profile-nav-item[data-tab="${initialTab}"]`);
        if (targetNav) targetNav.click();
    }

    // Profile update
    profileForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = displayNameInput.value.trim();

        if (!newName) {
            alert('Por favor, insira um nome válido.');
            return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
            data: { full_name: newName }
        });

        if (updateError) {
            alert('Erro ao atualizar perfil: ' + updateError.message);
        } else {
            alert('Perfil atualizado com sucesso!');
            // Refresh UI
            document.querySelectorAll('.user-name-text').forEach(el => el.textContent = newName);
        }
    });

    // Password reset modal logic
    btnResetPassword?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
    });

    window.closeResetModal = () => {
        if (modal) modal.style.display = 'none';
    };

    btnSendResetLink?.addEventListener('click', async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
            redirectTo: window.location.origin + '/login.html',
        });

        if (error) {
            alert('Erro ao enviar link: ' + error.message);
        } else {
            alert('Link de redefinição enviado para o seu email!');
            closeResetModal();
        }
    });

    // Dashboard Statistics
    let adminSalesChart = null;

    async function loadAdminStats() {
        if (!currentUserIsAdmin) return;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
        const yesterdayEnd = todayStart;
        
        const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const lastDayLastMonth = firstDayMonth;

        // Fetch Today's Sales
        const { data: todayOrders } = await supabase
            .from('orders')
            .select('total_price')
            .gte('created_at', todayStart)
            .neq('status', 'Cancelado');
        
        const todayTotal = todayOrders?.reduce((acc, curr) => acc + parseFloat(curr.total_price), 0) || 0;
        document.getElementById('statsToday').textContent = `R$ ${todayTotal.toFixed(2).replace('.', ',')}`;

        // Fetch Yesterday's Sales for comparison
        const { data: yesterdayOrders } = await supabase
            .from('orders')
            .select('total_price')
            .gte('created_at', yesterdayStart)
            .lt('created_at', yesterdayEnd)
            .neq('status', 'Cancelado');
        
        const yesterdayTotal = yesterdayOrders?.reduce((acc, curr) => acc + parseFloat(curr.total_price), 0) || 0;
        document.getElementById('compareYesterday').textContent = `vs Ontem: R$ ${yesterdayTotal.toFixed(2).replace('.', ',')}`;

        // Fetch This Month's Sales
        const { data: monthOrders } = await supabase
            .from('orders')
            .select('total_price')
            .gte('created_at', firstDayMonth)
            .neq('status', 'Cancelado');
        
        const monthTotal = monthOrders?.reduce((acc, curr) => acc + parseFloat(curr.total_price), 0) || 0;
        document.getElementById('statsMonth').textContent = `R$ ${monthTotal.toFixed(2).replace('.', ',')}`;

        // Fetch Last Month's Sales for comparison
        const { data: lastMonthOrders } = await supabase
            .from('orders')
            .select('total_price')
            .gte('created_at', firstDayLastMonth)
            .lt('created_at', lastDayLastMonth)
            .neq('status', 'Cancelado');
            
        const lastMonthTotal = lastMonthOrders?.reduce((acc, curr) => acc + parseFloat(curr.total_price), 0) || 0;
        document.getElementById('compareLastMonth').textContent = `vs Mês Ant: R$ ${lastMonthTotal.toFixed(2).replace('.', ',')}`;

        // Total and Active Orders
        const { count: totalCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        const { count: activeCount } = await supabase.from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['Aguardando Pagamento', 'Em Andamento']);

        document.getElementById('statsTotalOrders').textContent = totalCount || 0;
        document.getElementById('activeOrders').textContent = `${activeCount || 0} Ativos agora`;

        // Load Chart
        updateDashboardChart(7);
    }

    window.updateDashboardChart = async (days) => {
        // Update active filter button
        document.querySelectorAll('.btn-chart-filter').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(days + 'D'));
        });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const { data: chartData, error } = await supabase
            .from('orders')
            .select('created_at, total_price')
            .gte('created_at', startDate.toISOString())
            .neq('status', 'Cancelado')
            .order('created_at', { ascending: true });

        if (error) return;

        // Group by day
        const grouped = {};
        // Initialize all days in range with 0
        for (let i = 0; i <= days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            grouped[dateStr] = 0;
        }

        chartData.forEach(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (grouped[dateStr] !== undefined) {
                grouped[dateStr] += parseFloat(order.total_price);
            }
        });

        const labels = Object.keys(grouped).reverse();
        const values = Object.values(grouped).reverse();

        const ctx = document.getElementById('adminSalesChart').getContext('2d');
        
        if (adminSalesChart) {
            adminSalesChart.destroy();
        }

        adminSalesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Vendas (R$)',
                    data: values,
                    borderColor: '#ffffff',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ffffff',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#888' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#888' }
                    }
                }
            }
        });
    };

    // Close modal on click outside
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeResetModal();
    });
});
