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
   EMAIL NOTIFICATION SYSTEM (EmailJS)
========================= */

// Configuração do EmailJS
const EMAILJS_PUBLIC_KEY = "-24q3fs_ITyzP9R9A";
const EMAILJS_SERVICE_ID = "service_3an3bbj";
const EMAILJS_TEMPLATE_ID = "template_f7jzzfa";

// Carregar SDK do EmailJS dinamicamente
function loadEmailJS() {
    return new Promise((resolve, reject) => {
        // Se já carregou e inicializou, resolve na hora
        if (window.emailjs && typeof window.emailjs.send === 'function') {
            resolve();
            return;
        }
        
        // Se o script já está no DOM mas ainda não inicializou o objeto
        if (document.querySelector('script[src*="emailjs"]')) {
            const checkInterval = setInterval(() => {
                if (window.emailjs && typeof window.emailjs.send === 'function') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout de 5s para o intervalo
            setTimeout(() => { 
                clearInterval(checkInterval); 
                if (window.emailjs && typeof window.emailjs.send === 'function') resolve();
                else reject(new Error("EmailJS script exists but object not found after timeout")); 
            }, 5000);
            return;
        }

        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
        script.async = true;
        script.onload = () => {
            if (window.emailjs) {
                emailjs.init({
                    publicKey: EMAILJS_PUBLIC_KEY,
                    blockHeadless: true
                });
                console.log("EmailJS v4 inicializado com sucesso via onload.");
                resolve();
            } else {
                reject(new Error("EmailJS script loaded but window.emailjs not found"));
            }
        };
        script.onerror = (err) => {
            console.error("Falha ao carregar o script do EmailJS:", err);
            reject(err);
        };
        document.head.appendChild(script);
    });
}

// Função global para enviar e-mails
window.sendEmailNotification = async function(params) {
    console.log("Iniciando envio de e-mail:", params.type || "GERAL", params);
    try {
        await loadEmailJS();
        
        // Garantir inicialização do EmailJS antes de cada envio
        if (window.emailjs) {
            emailjs.init({
                publicKey: EMAILJS_PUBLIC_KEY,
                blockHeadless: true
            });
        }

        const recipientEmail = params.to_email || params.email || params.user_email;
        const recipientName = params.to_name || params.customer_name || params.name || (recipientEmail ? recipientEmail.split('@')[0] : "Cliente");

        if (!recipientEmail) {
            console.error("ERRO: E-mail não enviado: destinatário não identificado.");
            return false;
        }

        const emailParams = {
            to_name: recipientName,
            to_email: recipientEmail,
            user_name: recipientName,
            user_email: recipientEmail,
            customer_name: recipientName,
            customer_email: recipientEmail,
            site_name: "GalaxyBuxx",
            year: new Date().getFullYear(),
            ...params
        };

        console.log("Enviando parâmetros para EmailJS:", emailParams);

        const result = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            emailParams
        );

        console.log("✅ Resultado EmailJS:", result.status === 200 ? "SUCESSO" : "FALHA", result.text);
        return true;
    } catch (error) {
        console.error("❌ Erro crítico no sistema de e-mail:", error);
        return false;
    }
};

function initUI() {
  loadHeader();
  loadFooter();
  initReveal();
  initProductCards();
}

document.addEventListener('DOMContentLoaded', initUI);
