document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const loginError = document.getElementById('loginError');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
        loginError.style.display = 'none';

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email) { emailError.textContent = 'Email required'; emailError.style.display = 'block'; return; }
        if (!password) { passwordError.textContent = 'Password required'; passwordError.style.display = 'block'; return; }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('droneToken', data.token);
                localStorage.setItem('userEmail', email);
                window.location.href = '/dashboard.html';
            } else {
                loginError.textContent = data.message || 'Invalid credentials';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = 'Server error, try again';
            loginError.style.display = 'block';
        }
    });
});