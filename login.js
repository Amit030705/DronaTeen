document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const loginError = document.getElementById('login-error');
    const submitBtn = document.querySelector('.login-submit-btn');

    function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }
    function hideError(el) { el.style.display = 'none'; }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(emailError); hideError(passwordError); hideError(loginError);
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email) return showError(emailError, 'Email required');
        if (!password) return showError(passwordError, 'Password required');
        submitBtn.disabled = true; submitBtn.textContent = 'Logging in...';
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success && data.token) {
                localStorage.setItem('droneToken', data.token);
                localStorage.setItem('userEmail', email);
                window.location.href = '/dashboard.html';
            } else {
                showError(loginError, data.message || 'Invalid credentials');
                submitBtn.disabled = false; submitBtn.textContent = 'Login';
            }
        } catch (err) { showError(loginError, 'Server error'); submitBtn.disabled = false; submitBtn.textContent = 'Login'; }
    });

    // Simple registration via prompt (or you can build a separate reg page)
    document.getElementById('registerLink').addEventListener('click', async (e) => {
        e.preventDefault();
        const name = prompt("Full name");
        const email = prompt("Email address");
        const pwd = prompt("Password (min 6 chars)");
        if (name && email && pwd && pwd.length >= 6) {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password: pwd })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('droneToken', data.token);
                window.location.href = '/dashboard.html';
            } else alert(data.message);
        } else alert("Please fill all fields correctly");
    });
});