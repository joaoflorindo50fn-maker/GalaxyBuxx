document.addEventListener('DOMContentLoaded', async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    // State
    let currentUserIsAdmin = false;
    let currentTicketId = null;
    let currentOrderId = null;
    let orderMessagesSubscription = null;
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

            const tbody = document.getElementById(tableId);
            if (!tbody) return;

            // 1. Buscar os pedidos
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('status', statusFilter)
                .order('created_at', { ascending: false });

            if (ordersError) {
                console.error("Erro ao carregar pedidos:", ordersError);
                tbody.innerHTML = `<tr><td colspan="6" class="empty-table">Erro ao carregar pedidos: ${ordersError.message}</td></tr>`;
                return;
            }

            console.log("Pedidos carregados:", orders); // Debug

            if (!orders || orders.length === 0) {
                const msg = tabId === 'admin-pedidos' ? 'Nenhum pedido aguardando pagamento.' : 
                            tabId === 'admin-entregas' ? 'Nenhum pedido em andamento.' :
                            tabId === 'admin-comprovantes' ? 'Nenhum pedido concluído.' : 'Nenhum pedido cancelado.';
                tbody.innerHTML = `<tr><td colspan="6" class="empty-table">${msg}</td></tr>`;
                return;
            }

            // 2. Coletar IDs de usuários únicos e buscar seus dados
            const userIds = [...new Set(orders.map(o => o.user_id).filter(id => id))];
            console.log("IDs de usuários para buscar:", userIds); // Debug
            let userMap = {};

            if (userIds.length > 0) {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('id, username, email')
                    .in('id', userIds);
                
                if (userError) {
                    console.error("Erro ao buscar dados de usuários:", userError);
                }

                if (userData) {
                    console.log("Dados de usuários encontrados:", userData); // Debug
                    userData.forEach(u => {
                        userMap[u.id] = u;
                    });
                }
            }

            // 3. Renderizar a tabela unindo os dados
            tbody.innerHTML = orders.map(order => {
                const user = userMap[order.user_id];
                const orderIdStr = order.id.substring(0, 8).toUpperCase();
                
                // Se não encontrar o usuário pela ID, tenta mostrar o que tem no pedido
                const displayName = user?.username || order.customer_name || 'Usuário s/ nome';
                const displayEmail = user?.email || order.customer_contact || 'Sem email';
                
                if (tabId === 'admin-pedidos') {
                    return `
                    <tr>
                        <td>#${orderIdStr}</td>
                        <td class="client-cell"><strong>${displayName}</strong><br><span>${displayEmail}</span></td>
                        <td>${order.product_name} x${order.quantity}</td>
                        <td>R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</td>
                        <td>
                            <select class="status-select-admin" onchange="updateOrderStatus('${order.id}', this.value)">
                                <option value="Aguardando Pagamento" selected>Aguardando Pagamento</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </td>
                        <td>
                            <button class="btn-action-table" onclick="openOrderChat('${order.id}')">
                                <i class="fa-solid fa-comments"></i> Chat
                            </button>
                        </td>
                    </tr>`;
                } else if (tabId === 'admin-entregas') {
                    return `
                    <tr>
                        <td>#${orderIdStr}</td>
                        <td class="client-cell"><strong>${displayName}</strong><br><span>${displayEmail}</span></td>
                        <td>${order.product_name}</td>
                        <td>${order.quantity}</td>
                        <td>
                            <select class="status-select-admin" onchange="updateOrderStatus('${order.id}', this.value)">
                                <option value="Em Andamento" selected>Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </td>
                        <td>
                            <button class="btn-action-table" onclick="openOrderChat('${order.id}')">
                                <i class="fa-solid fa-comments"></i> Chat
                            </button>
                        </td>
                    </tr>`;
                } else {
                    const isCancelled = tabId === 'admin-cancelados';
                    return `
                    <tr>
                        <td>${new Date(order.created_at).toLocaleDateString()}</td>
                        <td class="client-cell"><strong>${displayName}</strong><br><span>${displayEmail}</span></td>
                        <td>#${orderIdStr} - ${order.product_name}</td>
                        <td>${isCancelled ? `R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}` : 'Entrega'}</td>
                        <td><span class="status-badge ${isCancelled ? 'cancelled' : 'completed'}">${order.status}</span></td>
                        <td>
                            <button class="btn-action-table" onclick="openOrderChat('${order.id}')">
                                <i class="fa-solid fa-eye"></i> Ver Chat
                            </button>
                        </td>
                    </tr>`;
                }
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
        }
    };

    async function loadTicketMessages(ticketId) {
        const messagesDiv = document.getElementById('adminChatMessages');
        if (!messagesDiv) return;

        const { data: messages, error } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (!error && messages) {
            messagesDiv.innerHTML = messages.map(msg => `
                <div class="chat-message ${msg.is_support ? 'admin' : 'customer'}">
                    ${msg.message}
                    <span class="message-time">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            `).join('');
            
            // Scroll to bottom
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    // Ticket Status Confirmation Logic
    const confirmOverlay = document.getElementById('confirmOverlay');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    let pendingTicketStatus = null;

    window.handleAdminTicketStatusChange = (newStatus) => {
        if (!currentTicketId) return;

        if (newStatus === 'resolved') {
            pendingTicketStatus = 'resolved';
            if (confirmOverlay) confirmOverlay.style.display = 'flex';
        } else {
            updateTicketStatus(newStatus);
        }
    };

    confirmYes?.addEventListener('click', async () => {
        if (currentTicketId && pendingTicketStatus) {
            await updateTicketStatus(pendingTicketStatus);
            if (confirmOverlay) confirmOverlay.style.display = 'none';
            pendingTicketStatus = null;
        }
    });

    confirmNo?.addEventListener('click', () => {
        if (confirmOverlay) confirmOverlay.style.display = 'none';
        pendingTicketStatus = null;
    });

    // Update Ticket Status
    window.updateTicketStatus = async (newStatus) => {
        if (!currentTicketId) return;

        if (newStatus === 'resolved') {
            try {
                const { error } = await supabase
                    .from('tickets')
                    .delete()
                    .eq('id', currentTicketId);

                if (!error) {
                    showNotification('Ticket resolvido e removido!', 'success');
                    // Esconder chat e limpar ID
                    const chatView = document.getElementById('adminTicketChat');
                    const noSelected = document.getElementById('noTicketSelected');
                    if (chatView) chatView.classList.add('hidden');
                    if (noSelected) noSelected.classList.remove('hidden');
                    
                    currentTicketId = null;
                    
                    // Recarregar a lista após um pequeno delay
                    setTimeout(() => {
                        loadAdminTabData('admin-tickets');
                    }, 300);
                } else {
                    console.error('Erro ao deletar ticket:', error);
                    showNotification('Erro ao remover ticket.', 'error');
                }
            } catch (err) {
                console.error('Erro na operação de delete:', err);
            }
            return;
        }

        const { error } = await supabase
            .from('tickets')
            .update({ status: newStatus })
            .eq('id', currentTicketId);

        if (!error) {
            showNotification('Status do ticket atualizado!', 'success');
            loadAdminTabData('admin-tickets'); // Refresh list
        }
    };

    // Send Message Form
    document.getElementById('adminChatForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('adminChatMessageInput');
        const message = input.value.trim();

        if (!message || !currentTicketId) return;

        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: currentTicketId,
                sender_id: user.id,
                message: message,
                is_support: true
            });

        if (!error) {
            input.value = '';
            loadTicketMessages(currentTicketId);
        } else {
            alert('Erro ao enviar mensagem: ' + error.message);
        }
    });

    // Function to update status in DB
    window.updateOrderStatus = async (orderId, newStatus) => {
        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);

        if (error) {
            window.showNotification('Erro ao atualizar status: ' + error.message, 'error');
        } else {
            window.showNotification('Status do pedido atualizado!', 'success');
            // Refresh current tab
            const activeAdminTab = document.querySelector('.admin-tab-btn.active')?.getAttribute('data-admin-tab');
            if (activeAdminTab) loadAdminTabData(activeAdminTab);
            
            // If on user view, refresh too
            loadUserOrders();
        }
    };

    let currentOrderFilter = 'ativos';

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

        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        if (error || !orders || orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-table">Nenhum pedido encontrado nesta categoria.</td></tr>`;
            return;
        }

        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>#${order.id.substring(0, 8).toUpperCase()}</td>
                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                <td>${order.product_name}</td>
                <td>R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}</td>
                <td><span class="status-badge ${order.status.toLowerCase().replace(/ /g, '-')}">${order.status}</span></td>
                <td>
                    ${order.status === 'Em Andamento' || order.status === 'Concluído' ? 
                        `<button class="btn-action-table" onclick="openOrderChat('${order.id}')">
                            <i class="fa-solid fa-comments"></i> Chat
                        </button>` : 
                        `<button class="btn-action-table disabled" title="Aguardando confirmação">
                            <i class="fa-solid fa-lock"></i>
                        </button>`
                    }
                </td>
            </tr>
        `).join('');

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
        loadOrderMessages(orderId);
        setupOrderMessagesRealtime(orderId);
    };

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

        container.innerHTML = welcome + messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgFromAdmin = msg.is_support;
            
            let senderName = "";
            if (isMe) {
                senderName = "Você";
            } else if (msgFromAdmin) {
                senderName = adminNamesCache[msg.sender_id] || "Suporte GalaxyBuxx";
            } else {
                senderName = "Cliente";
            }

            return `
                <div class="message ${isMe ? 'sent' : 'received'} ${msgFromAdmin && !isMe ? 'admin-msg' : ''}" data-msg-id="${msg.id}">
                    <span class="message-sender">${senderName}</span>
                    ${msg.message ? `<p>${msg.message}</p>` : ''}
                    ${msg.attachment_url ? `<img src="${msg.attachment_url}" class="message-attachment" onclick="openLightbox('${msg.attachment_url}')">` : ''}
                    <span class="message-meta">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function setupOrderMessagesRealtime(orderId) {
        if (orderMessagesSubscription) {
            supabase.removeChannel(orderMessagesSubscription);
        }

        orderMessagesSubscription = supabase.channel(`order_messages_${orderId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'order_messages',
                filter: `order_id=eq.${orderId}`
            }, async (payload) => {
                console.log('Nova mensagem recebida via realtime:', payload.new);
                const newMessage = payload.new;
                
                if (document.querySelector(`[data-msg-id="${newMessage.id}"]`)) return;

                const container = document.getElementById('orderChatMessages');
                if (!container) return;

                const isMe = newMessage.sender_id === user.id;
                const msgFromAdmin = newMessage.is_support;
                
                let senderName = isMe ? "Você" : (msgFromAdmin ? (adminNamesCache[newMessage.sender_id] || "Suporte GalaxyBuxx") : "Cliente");

                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${isMe ? 'sent' : 'received'} ${msgFromAdmin && !isMe ? 'admin-msg' : ''}`;
                msgDiv.setAttribute('data-msg-id', newMessage.id);
                msgDiv.innerHTML = `
                    <span class="message-sender">${senderName}</span>
                    ${newMessage.message ? `<p>${newMessage.message}</p>` : ''}
                    ${newMessage.attachment_url ? `<img src="${newMessage.attachment_url}" class="message-attachment" onclick="openLightbox('${newMessage.attachment_url}')">` : ''}
                    <span class="message-meta">${new Date(newMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                `;

                container.appendChild(msgDiv);
                container.scrollTop = container.scrollHeight;

                // Buscar nome do admin em background se não tiver
                if (msgFromAdmin && !isMe && !adminNamesCache[newMessage.sender_id]) {
                    supabase.from('users').select('full_name').eq('id', newMessage.sender_id).single().then(({data}) => {
                        if (data && data.full_name) {
                            adminNamesCache[newMessage.sender_id] = data.full_name;
                            msgDiv.querySelector('.message-sender').textContent = data.full_name;
                        }
                    });
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Realtime subscribed for order:', orderId);
                }
            });
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
                    msgDiv.className = `message sent ${currentUserIsAdmin ? 'admin-msg' : ''}`;
                    msgDiv.setAttribute('data-msg-id', newMsg.id);
                    msgDiv.innerHTML = `
                        <span class="message-sender">Você</span>
                        ${newMsg.message ? `<p>${newMsg.message}</p>` : ''}
                        ${newMsg.attachment_url ? `<img src="${newMsg.attachment_url}" class="message-attachment" onclick="openLightbox('${newMsg.attachment_url}')">` : ''}
                        <span class="message-meta">${new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
