const supabaseUrl = 'https://lfyaxcrtzinotqtndoia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmeWF4Y3J0emlub3RxdG5kb2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTM0MjAsImV4cCI6MjA4NTQ2OTQyMH0.-0Hv1YD1cUWGW0pXuLcJxEYXwAR7lywLp-mNWKAvUNI';

// Inicializa o cliente imediatamente se o script for carregado
if (window.supabase && !window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        events_per_second: 50
      }
    }
  });
}

function getSupabase() {
  if (!window.supabaseClient && window.supabase) {
    window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          events_per_second: 50
        }
      }
    });
  }
  return window.supabaseClient;
}

async function isStoreOpen() {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { data: settings } = await client
      .from('site_settings')
      .select('*')
      .eq('key', 'store_open')
      .single();

    if (settings) {
      if (settings.value === 'true') return true;
      if (settings.value === 'false') return false;
    }

    // Default: 12:00 to 00:00
    const hour = new Date().getHours();
    return hour >= 12 && hour < 24;
  } catch (err) {
    console.error('Error checking store status:', err);
    return false;
  }
}

function checkIsSubdir() {
  const pathParts = window.location.pathname.split(/[\\/]/);
  return pathParts.includes('pages') || pathParts.includes('tutoriais');
}

/* =========================
   NOTIFICATION SYSTEM
========================= */

function initNotificationSystem() {
    if (!document.getElementById('notification-container')) {
        const container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    // Carrega o CSS de notificações se ainda não estiver carregado
    if (!document.querySelector('link[href*="notifications.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        const isSubdir = checkIsSubdir();
        link.href = (isSubdir ? '../' : '') + 'css/notifications.css';
        document.head.appendChild(link);
    }
}

window.showNotification = function(message, type = 'success', title = '') {
    initNotificationSystem();
    const container = document.getElementById('notification-container');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    if (!title) {
        title = type === 'success' ? 'Sucesso' : 'Erro';
    }

    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fa-solid ${icon}"></i>
        </div>
        <div class="notification-content">
            <span class="notification-title">${title}</span>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="notification-progress">
            <div class="notification-progress-bar" style="animation: progress-animation 5000ms linear forwards"></div>
        </div>
    `;

    container.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    const close = () => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    };

    notification.querySelector('.notification-close').onclick = close;

    // Auto-close after 5s
    setTimeout(close, 5000);
};

// Sobrescreve o alert nativo (opcional, mas recomendado para o que o usuário pediu)
window.alert = function(message) {
    const isError = message.toLowerCase().includes('erro') || 
                    message.toLowerCase().includes('falha') || 
                    message.toLowerCase().includes('inválido') ||
                    message.toLowerCase().includes('não coincidem');
    
    window.showNotification(message, isError ? 'error' : 'success');
};

/* =========================
   HEADER / FOOTER
========================= */

let currentUserId = null;

async function updateAuthUI(retries = 5) {
  const authContainer = document.getElementById('auth-container');
  const client = getSupabase();
  
  if (!authContainer) {
    if (retries > 0) setTimeout(() => updateAuthUI(retries - 1), 100);
    return;
  }

  if (!client) {
    console.warn('Supabase client not available for Auth UI');
    if (currentUserId !== 'logged-out') {
        renderAuthTemplate('tpl-logged-out');
        currentUserId = 'logged-out';
    }
    return;
  }

  try {
    const { data: { session } } = await client.auth.getSession();
    let user = session?.user;

    if (!user) {
      const { data: { user: serverUser } } = await client.auth.getUser();
      user = serverUser;
    }
    
    if (user) {
      if (currentUserId !== user.id) {
          console.log('User detected:', user.email);
          updateUserUI(user);
          currentUserId = user.id;
      }
    } else {
      if (currentUserId !== 'logged-out') {
          console.log('No user detected, rendering logged-out UI');
          renderAuthTemplate('tpl-logged-out');
          currentUserId = 'logged-out';
      }
    }
  } catch (err) {
    console.error('Error in Auth UI:', err);
    if (currentUserId !== 'logged-out') {
        renderAuthTemplate('tpl-logged-out');
        currentUserId = 'logged-out';
    }
  }
}

// Função definitiva para alternar o menu de perfil
window.toggleProfileMenu = function(event) {
  console.log('Toggle profile menu triggered');
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }
  
  const btn = event.currentTarget;
  const wrapper = btn.closest('.header-profile-wrapper');
  const dropdown = wrapper ? wrapper.querySelector('.header-dropdown') : null;
  
  if (dropdown && btn) {
    const isActive = dropdown.getAttribute('data-active') === 'true' || dropdown.classList.contains('show');
    const newState = !isActive;
    
    dropdown.setAttribute('data-active', newState);
    btn.classList.toggle('active', newState);
    
    if (newState) {
      dropdown.classList.add('show');
      dropdown.style.setProperty('display', 'block', 'important');
      dropdown.style.setProperty('opacity', '1', 'important');
      dropdown.style.setProperty('visibility', 'visible', 'important');
    } else {
      dropdown.classList.remove('show');
      dropdown.style.setProperty('opacity', '0', 'important');
      dropdown.style.setProperty('visibility', 'hidden', 'important');
    }
    
    console.log('Menu state changed to:', newState);
  } else {
    console.error('Dropdown or wrapper not found:', { dropdown: !!dropdown, wrapper: !!wrapper });
  }
};

function updateUserUI(user) {
  renderAuthTemplate('tpl-logged-in');
  
  const metadata = user.user_metadata || {};
  const name = metadata.full_name || metadata.username || metadata.name || user.email.split('@')[0];
  const email = user.email;
  
  let avatar = metadata.avatar_url || metadata.picture;
  if (!avatar) {
    avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=222&color=fff&size=128`;
  }

  // Atualiza textos e imagens usando as novas classes
  const container = document.getElementById('auth-container');
  if (container) {
    container.querySelectorAll('.user-name-text').forEach(el => el.textContent = name);
    container.querySelectorAll('.user-email-text').forEach(el => el.textContent = email);
    container.querySelectorAll('.user-avatar-img').forEach(el => el.src = avatar);
  }

  // Estilização forçada para garantir visibilidade
  const dropdown = container ? container.querySelector('.header-dropdown') : null;
  if (dropdown) {
    dropdown.querySelectorAll('.dropdown-item span, .dropdown-item i').forEach(el => {
      el.style.setProperty('color', '#ffffff', 'important');
    });
    const logoutBtn = dropdown.querySelector('.logout-btn');
    if (logoutBtn) {
      logoutBtn.querySelectorAll('span, i').forEach(el => {
        el.style.setProperty('color', '#ff4b4b', 'important');
      });
    }
  }

  initHeaderInteractions();
}

function renderAuthTemplate(templateId) {
  const container = document.getElementById('auth-container');
  const template = document.getElementById(templateId);
  
  if (!container || !template) return;

  try {
    // Injetar o conteúdo do template diretamente
    container.innerHTML = template.innerHTML;
    console.log('Template rendered:', templateId);
  } catch (err) {
    console.error('Render error:', err);
  }
}

function initHeaderInteractions() {
  const container = document.getElementById('auth-container');
  if (!container) return;

  // Botão de Toggle do Perfil
  const profileToggle = container.querySelector('.header-profile-toggle');
  if (profileToggle) {
    profileToggle.onclick = (e) => window.toggleProfileMenu(e);
  }

  // Botão de Logout
  const logoutBtn = container.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      const client = getSupabase();
      if (client) {
        await client.auth.signOut();
        window.showNotification('Sessão encerrada com sucesso.', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    };
  }

  // Fechar ao clicar fora
  if (!window.headerInteractionInit) {
    document.addEventListener('click', (e) => {
      const container = document.getElementById('auth-container');
      const dropdown = container ? container.querySelector('.header-dropdown') : null;
      const btn = container ? container.querySelector('.header-profile-toggle') : null;
      
      if (dropdown && dropdown.getAttribute('data-active') === 'true') {
        if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
          dropdown.setAttribute('data-active', 'false');
          dropdown.classList.remove('show');
          dropdown.style.setProperty('opacity', '0', 'important');
          dropdown.style.setProperty('visibility', 'hidden', 'important');
          if (btn) btn.classList.remove('active');
        }
      }
    });
    window.headerInteractionInit = true;
  }
}

function loadHeader() {
  const headerPlaceholder = document.querySelector('header');
  if (!headerPlaceholder) return;

  headerPlaceholder.className = 'main-header';
  // Melhora detecção de subdiretório
  const isSubdir = checkIsSubdir();
  
  const path = isSubdir ? '../header.html' : 'header.html';
  const timestamp = new Date().getTime();

  fetch(`${path}?t=${timestamp}`)
    .then(res => res.text())
    .then(html => {
      // Injeta todo o conteúdo, incluindo templates
      headerPlaceholder.innerHTML = html;

      const prefix = isSubdir ? '../' : '';
      
      // Função para corrigir links em um elemento ou template
      const fixLinks = (root) => {
        root.querySelectorAll('a').forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.startsWith('/')) {
            link.setAttribute('href', prefix + href.substring(1));
          }
        });
      };

      // Corrige links no header principal
      fixLinks(headerPlaceholder);

      // Corrige links dentro de cada template
      headerPlaceholder.querySelectorAll('template').forEach(tpl => {
        const content = tpl.content;
        fixLinks(content);
        // Também atualiza o innerHTML para garantir que renderAuthTemplate pegue a versão corrigida
        const temp = document.createElement('div');
        temp.appendChild(content.cloneNode(true));
        tpl.innerHTML = temp.innerHTML;
      });

      const currentPath = window.location.pathname;
      headerPlaceholder.querySelectorAll('nav a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && (currentPath.endsWith(href) || (currentPath === '/' && href.includes('index.html')))) {
          link.classList.add('active');
        }
      });

      if (window.initNavDirection) window.initNavDirection();
      
      // Initialize Auth UI after header is loaded
      setTimeout(async () => {
        await updateAuthUI();
        
        const client = getSupabase();
        if (client && !window.authListenerAttached) {
          // Escuta mudanças na autenticação
          client.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event);
            updateAuthUI();
          });
          window.authListenerAttached = true;
        }
      }, 100);
    })
    .catch(err => {
      console.error('Falha ao carregar header:', err);
    });
}

function loadFooter() {
  const footerPlaceholder = document.querySelector('footer');
  if (!footerPlaceholder) return;

  const isSubdir = checkIsSubdir();
  const path = isSubdir ? '../footer.html' : 'footer.html';

  fetch(path)
    .then(res => res.text())
    .then(html => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const prefix = isSubdir ? '../' : '';
      temp.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/')) {
          link.setAttribute('href', prefix + href.substring(1));
        }
      });
      footerPlaceholder.outerHTML = temp.innerHTML;
    })
    .catch(err => console.error('Failed to load footer', err));
}

function initProductCards() {
  const gameName = document.querySelector('.game-header-info h1')?.textContent || document.querySelector('h1')?.textContent || 'GalaxyBuxx';
  document.querySelectorAll('.gp-card').forEach(card => {
    const btn = card.querySelector('.gp-card-btn');
    if (!btn) return;
    const name = card.querySelector('.gp-card-title')?.textContent;
    const priceText = card.querySelector('.gp-card-price')?.textContent || '0';
    const price = parseFloat(priceText.replace('R$', '').replace(',', '.'));
    const image = card.querySelector('.gp-card-top img')?.src;
    const handleClick = e => {
      e.preventDefault();
      const params = new URLSearchParams({
        id: btoa(name || Date.now().toString()).substring(0, 8),
        name, price, image: encodeURIComponent(image || '../placeholder-bw.png'), game: gameName
      });
      window.location.href = `/pages/gamepass-detail.html?${params.toString()}`;
    };
    btn.addEventListener('click', handleClick);
    card.addEventListener('click', handleClick);
    card.style.cursor = 'pointer';
  });
}

function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const revealOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-active');
        observer.unobserve(entry.target);
      }
    });
  }, revealOptions);
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add('reveal-active');
    else observer.observe(el);
  });
}

/* =========================
   SISTEMA DE NOTIFICAÇÃO (EmailJS)
========================= */

// CONFIGURAÇÃO - VERIFIQUE NO SEU DASHBOARD DO EMAILJS
const EMAILJS_PUBLIC_KEY = "7db2P2EUxIYXLkhaF";
const EMAILJS_SERVICE_ID = "service_kurkpcw";
const EMAILJS_TEMPLATE_ID = "template_611ei15";

// Função para carregar e inicializar o SDK
async function initEmailJS() {
    if (window.emailjs) return true;

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
        script.onload = () => {
            emailjs.init({
                publicKey: EMAILJS_PUBLIC_KEY,
                blockHeadless: true
            });
            console.log("🚀 EmailJS Initialized");
            resolve(true);
        };
        script.onerror = () => {
            console.error("❌ Failed to load EmailJS SDK");
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

// Função Global de Envio
window.sendEmailNotification = async function(params) {
    try {
        const type = params.type || "notification"; // 'order', 'ticket', 'status_update', 'chat_reply'
        console.log(`📤 Enviando e-mail [${type}]...`, params.subject);
        await initEmailJS();

        // Template Params - Nomes simplificados para máxima compatibilidade
        const templateParams = {
            from_name: "GalaxyBuxx",
            user_name: params.to_name || "Cliente",
            to_name: params.to_name || "Cliente",
            to_email: params.to_email || params.email,
            subject: params.subject || "Notificação GalaxyBuxx",
            message: params.message || params.description || "Você tem uma nova atualização no seu pedido.",
            order_id: params.order_id ? params.order_id.substring(0, 8).toUpperCase() : "N/A",
            ticket_id: params.ticket_id ? params.ticket_id.substring(0, 8).toUpperCase() : "N/A",
            status: params.order_status || params.ticket_status || "Atualizado",
            site_name: "GalaxyBuxx"
        };

        const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            templateParams
        );

        console.log("✅ E-mail enviado!", response.status, response.text);
        return true;
    } catch (error) {
        console.error("❌ Erro no EmailJS:", error);
        return false;
    }
};

// Teste rápido via console: 
// sendEmailNotification({ to_email: 'seu@email.com', subject: 'Teste', message: 'Funcionando!' })

window.testEmail = async function(email) {
    if (!email) {
        console.log("Uso: testEmail('seu-email@gmail.com')");
        return;
    }
    console.log("🧪 Iniciando teste de e-mail...");
    const ok = await window.sendEmailNotification({
        to_email: email,
        to_name: "Testador",
        subject: "Teste de Configuração",
        message: "Se você recebeu isso, o EmailJS está funcionando corretamente!",
        description: "Teste realizado pelo sistema de diagnóstico."
    });
    
    if (ok) {
        alert("E-mail enviado! Verifique sua caixa de entrada.");
    } else {
        alert("Falha no envio. Abra o Console (F12) para ver o erro.");
    }
};


async function updateGlobalOpeningHours() {
  const cards = document.querySelectorAll('.opening-hours-card');
  if (cards.length === 0) return;
  
  const isOpen = await isStoreOpen();
  
  cards.forEach(card => {
    const notice = card.querySelector('.hours-notice');
    const badge = card.querySelector('.hours-status-badge');
    
    if (isOpen) {
      card.classList.remove('closed');
      card.classList.add('open');
      if (badge) badge.textContent = 'ONLINE';
      if (notice) {
        notice.textContent = '✓ Estamos online! Seu pedido será entregue agora.';
        notice.style.display = 'block';
      }
    } else {
      card.classList.remove('open');
      card.classList.add('closed');
      if (badge) badge.textContent = 'OFFLINE';
      if (notice) {
        notice.textContent = '⚠ Atendimento em pausa. Você pode comprar, mas entregaremos após às 12:00.';
        notice.style.display = 'block';
      }
    }
  });
}

function initUI() {
  loadHeader();
  loadFooter();
  initReveal();
  initProductCards();
  updateGlobalOpeningHours();
  // Atualiza a cada 1 minuto para virar o horário automaticamente
  setInterval(updateGlobalOpeningHours, 60000);
}

document.addEventListener('DOMContentLoaded', initUI);
