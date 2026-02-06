document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    
    // Pegar dados do produto da URL
    const product = {
        name: params.get('name') || 'Produto não identificado',
        game: params.get('game') || 'Jogo',
        price: parseFloat(params.get('price')) || 0,
        image: params.get('image') ? decodeURIComponent(params.get('image')) : 'passimg/placeholder-bw.png'
    };

    let quantity = 1;

    // Elementos da Interface
    const nameEl = document.getElementById('checkoutName');
    const gameEl = document.getElementById('checkoutGame');
    const imgEl = document.getElementById('checkoutImg');
    const subtotalEl = document.getElementById('subtotalValue');
    const totalEl = document.getElementById('totalValue');
    const finalPayBtn = document.getElementById('finalPayBtn');
    const qtyValueEl = document.getElementById('qtyValue');
    const qtyMinusBtn = document.getElementById('qtyMinus');
    const qtyPlusBtn = document.getElementById('qtyPlus');

    // Inicialização
    if (nameEl) nameEl.textContent = product.name;
    if (gameEl) gameEl.textContent = product.game;
    if (imgEl) imgEl.src = product.image;

    function updateDisplay() {
        const total = product.price * quantity;
        const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;
        
        if (qtyValueEl) qtyValueEl.textContent = quantity;
        if (subtotalEl) subtotalEl.textContent = formattedTotal;
        if (totalEl) totalEl.textContent = formattedTotal;
        if (finalPayBtn) finalPayBtn.textContent = `Pagar ${formattedTotal}`;
    }

    // Controles de Quantidade
    qtyMinusBtn?.addEventListener('click', () => {
        if (quantity > 1) {
            quantity--;
            updateDisplay();
        }
    });

    qtyPlusBtn?.addEventListener('click', () => {
        quantity++;
        updateDisplay();
    });

    // Lógica do botão Finalizar
    finalPayBtn?.addEventListener('click', async () => {
        // Verificar se a loja está aberta
        const open = await isStoreOpen();
        if (!open) {
            window.showNotification('A loja está fechada no momento. Os pagamentos estão desabilitados.', 'error');
            return;
        }

        const client = getSupabase();
        if (!client) return;

        const { data: { user } } = await client.auth.getUser();
        if (!user) {
            window.showNotification('Você precisa estar logado para comprar.', 'error');
            return;
        }

        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const contactInfo = document.getElementById('contactInfo').value;

        if (!firstName || !lastName || !contactInfo) {
            window.showNotification('Por favor, preencha todas as informações de contato.', 'error');
            return;
        }

        const total = product.price * quantity;
        const realPixKey = `00020101021126580014br.gov.bcb.pix0136f9a66e98-20e4-4856-b68b-f581f38381415204000053039865802BR5921JOAO P F DA S SANTANA6013SAO BERNARDO 62070503***63043D6A`;

        try {
            const { data: order, error } = await client.from('orders').insert([{
                user_id: user.id,
                product_name: product.name,
                product_game: product.game,
                product_image: product.image,
                quantity: quantity,
                total_price: total,
                customer_name: `${firstName} ${lastName}`,
                customer_contact: contactInfo,
                pix_key: realPixKey,
                status: 'Aguardando Pagamento'
            }]).select().single();

            if (error) throw error;

            // Enviar e-mail de confirmação
            window.sendEmailNotification({
                to_email: user.email,
                to_name: `${firstName} ${lastName}`,
                order_id: order.id.substring(0, 8).toUpperCase(),
                subject: `Pedido Recebido! #${order.id.substring(0, 8).toUpperCase()}`,
                description: "Seu pedido foi criado e estamos aguardando o pagamento via Pix.",
                product_name: order.product_name
            });

            showPaymentOverlay(order);
        } catch (err) {
            console.error('Erro ao criar pedido:', err);
            window.showNotification('Erro ao processar pedido. Tente novamente.', 'error');
        }
    });

    function showPaymentOverlay(order) {
        const overlay = document.getElementById('paymentOverlay');
        const pixCode = document.getElementById('pixCode');
        const pixQR = document.getElementById('pixQR');
        const pixTimer = document.getElementById('pixTimer');
        const pixAmount = document.getElementById('pixAmountValue');
        
        if (!overlay) return;

        if (pixAmount) {
            pixAmount.textContent = `R$ ${parseFloat(order.total_price).toFixed(2).replace('.', ',')}`;
        }

        pixCode.textContent = order.pix_key;
        pixQR.src = `pix/qrcode.png`;
        
        overlay.style.display = 'flex';

        // Timer de 15 minutos
        let timeLeft = 15 * 60;
        const timerInterval = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            pixTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                cancelOrder(order.id);
            }
            timeLeft--;
        }, 1000);

        // Copiar Pix
        const copyBtn = document.getElementById('btnCopyPix');
        const copyCard = document.getElementById('copyPixCard');
        
        const copyAction = () => {
            navigator.clipboard.writeText(order.pix_key).then(() => {
                copyCard.classList.add('copied');
                setTimeout(() => copyCard.classList.remove('copied'), 2000);
                window.showNotification('Código Pix copiado!', 'success');
            });
        };

        copyBtn.onclick = (e) => { e.stopPropagation(); copyAction(); };
        copyCard.onclick = copyAction;

        document.getElementById('closePayment').onclick = () => {
            overlay.style.display = 'none';
            clearInterval(timerInterval);
        };

        // Realtime listener para mudança de status
        const client = getSupabase();
        const channel = client.channel(`order_status_${order.id}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'orders',
                filter: `id=eq.${order.id}`
            }, (payload) => {
                if (payload.new.status === 'Em Andamento') {
                    window.showNotification('Pagamento detectado! Redirecionando...', 'success');
                    setTimeout(() => {
                        window.location.href = 'perfil.html?tab=historico';
                    }, 2000);
                }
            })
            .subscribe();
    }

    async function cancelOrder(orderId) {
        const client = getSupabase();
        await client.from('orders').update({ status: 'Cancelado' }).eq('id', orderId);
        window.showNotification('Pedido cancelado por expiração.', 'error');
        setTimeout(() => window.location.reload(), 2000);
    }

    async function checkStoreOnLoad() {
        const open = await isStoreOpen();
        if (!open) {
            window.showNotification('Atenção: A loja está fechada. Você não poderá finalizar o pagamento.', 'error');
            if (finalPayBtn) {
                finalPayBtn.style.opacity = '0.5';
                finalPayBtn.style.cursor = 'not-allowed';
            }
        }
    }

    updateDisplay();
    checkStoreOnLoad();
});
