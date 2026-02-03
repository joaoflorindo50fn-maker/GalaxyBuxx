let isRegisterMode = false;

// Função debounce para limitar a frequência de chamadas
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const authFormContainer = document.getElementById('auth-form-container');
    if (authFormContainer) {
        authFormContainer.classList.add('login-mode');
    }

    // Check for password recovery token
    const client = getSupabase();
    if (client) {
        client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                showResetPasswordForm();
            }
        });

        // Also check URL hash directly just in case
        if (window.location.hash && window.location.hash.includes('type=recovery')) {
            showResetPasswordForm();
        }
    }
    
    // Forgot password handler
    const forgotPasswordLink = document.querySelector('.forgot-password');
    forgotPasswordLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        if (!email) {
            alert('Por favor, insira seu email para recuperar a senha.');
            return;
        }

        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/login.html',
        });

        if (error) {
            alert('Erro ao enviar link: ' + error.message);
        } else {
            alert('Link de redefinição enviado para o seu email!');
        }
    });
});

function showResetPasswordForm() {
    isRegisterMode = false; // Reset to login state first
    const formContent = document.getElementById('form-content');
    const h2 = formContent.querySelector('h2');
    const subtitle = formContent.querySelector('.subtitle');
    const submitBtn = formContent.querySelector('#login-form .main-btn');
    const form = document.getElementById('login-form');
    
    h2.textContent = 'Nova Senha';
    subtitle.textContent = 'Crie uma nova senha para sua conta.';
    submitBtn.textContent = 'Salvar Nova Senha';
    
    // Hide email and show only password inputs
    const emailInput = document.getElementById('email');
    const emailGroup = emailInput?.closest('.input-group');
    if (emailGroup) emailGroup.classList.add('hidden');
    
    const confirmPasswordGroup = document.querySelector('.confirm-password-group');
    confirmPasswordGroup.classList.remove('hidden');
    
    // Hide divider and oauth buttons
    document.querySelector('.divider')?.classList.add('hidden');
    document.querySelector('.oauth-buttons')?.classList.add('hidden');
    document.querySelector('.register-link')?.classList.add('hidden');
    document.querySelector('.forgot-password')?.classList.add('hidden');

    // Change form submit handler
    form.removeEventListener('submit', handleAuthSubmit);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!password || !confirmPassword) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        if (password !== confirmPassword) {
            alert('As senhas não coincidem.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvando...';

        const client = getSupabase();
        const { error } = await client.auth.updateUser({ password: password });

        if (error) {
            alert('Erro ao atualizar senha: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salvar Nova Senha';
        } else {
            alert('Senha atualizada com sucesso!');
            window.location.href = '/index.html';
        }
    });
}

function toggleRegister(event) {
    if (event) {
        event.preventDefault(); // Previne o comportamento padrão do link
    }

    isRegisterMode = !isRegisterMode;
    const authFormContainer = document.getElementById('auth-form-container');
    const formContent = document.getElementById('form-content');
    const h2 = formContent.querySelector('h2');
    const subtitle = formContent.querySelector('.subtitle');
    const submitBtn = formContent.querySelector('#login-form .main-btn');
    const link = formContent.querySelector('.register-link span');
    const form = document.getElementById('login-form');

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const usernameInput = document.getElementById('username');
    const confirmPasswordInput = document.getElementById('confirm-password');

    const usernameGroup = document.querySelector('.username-group');
    const confirmPasswordGroup = document.querySelector('.confirm-password-group');

    if (isRegisterMode) {
        h2.textContent = 'Criar Conta';
        subtitle.textContent = 'Junte-se a nós para a melhor experiência.';
        submitBtn.textContent = 'Cadastrar';
        link.innerHTML = 'FAZER LOGIN';
        link.parentElement.innerHTML = 'Já tem uma conta? ' + link.outerHTML;

        usernameGroup.classList.remove('hidden');
        confirmPasswordGroup.classList.remove('hidden');

        emailInput.removeAttribute('required');
        passwordInput.removeAttribute('required');
        usernameInput.setAttribute('required', '');
        confirmPasswordInput.setAttribute('required', '');

    } else {
        h2.textContent = 'Bem-vindo(a)';
        subtitle.textContent = 'Entre para gerenciar seus Robux e pedidos.';
        submitBtn.textContent = 'Entrar na conta';
        link.innerHTML = 'REGISTRE-SE';
        link.parentElement.innerHTML = 'Não tem uma conta? ' + link.outerHTML;

        usernameGroup.classList.add('hidden');
        confirmPasswordGroup.classList.add('hidden');

        usernameInput.removeAttribute('required');
        confirmPasswordInput.removeAttribute('required');
        emailInput.setAttribute('required', '');
        passwordInput.setAttribute('required', '');
    }
}

async function signInWithGoogle() {
    const client = getSupabase();
    if (!client) return;
    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/index.html'
        }
    });
    if (error) {
        alert('Erro ao fazer login com Google: ' + error.message);
    }
}

async function signInWithDiscord() {
    const client = getSupabase();
    if (!client) return;
    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: window.location.origin + '/index.html'
        }
    });
    if (error) {
        alert('Erro ao fazer login com Discord: ' + error.message);
    }
}

const handleAuthSubmit = async function(event) {
    event.preventDefault();
    
    const client = getSupabase();
    if (!client) {
        alert('Erro: Sistema de autenticação não carregado.');
        return;
    }

    const submitBtn = event.target.querySelector('.main-btn');
    if (submitBtn.disabled) return; // Evita cliques múltiplos

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        if (isRegisterMode) {
            const username = document.getElementById('username').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!username || !email || !password || !confirmPassword) {
                alert('Por favor, preencha todos os campos.');
                return;
            }

            if (password !== confirmPassword) {
                alert('As senhas não coincidem.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Processando...';

            const { data, error } = await client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { username: username }
                }
            });

            if (error) {
                if (error.status === 429) {
                    alert('Limite de tentativas excedido. Por favor, aguarde alguns minutos antes de tentar novamente.');
                } else {
                    alert('Erro no registro: ' + error.message);
                }
                submitBtn.disabled = false;
                submitBtn.textContent = 'Cadastrar';
            } else {
                showNotification('Registro realizado com sucesso! Verifique seu e-mail para confirmar a conta.', 'success');
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 2000);
            }

        } else {
            if (!email || !password) {
                alert('Por favor, preencha todos os campos.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Entrando...';

            const { data, error } = await client.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                alert('Erro no login: ' + error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Entrar na conta';
            } else {
                showNotification('Login realizado com sucesso! Bem-vindo de volta.', 'success');
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 1500);
            }
        }
    } catch (err) {
        alert('Erro inesperado: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = isRegisterMode ? 'Cadastrar' : 'Entrar na conta';
    }
};

document.getElementById('login-form').addEventListener('submit', handleAuthSubmit);
