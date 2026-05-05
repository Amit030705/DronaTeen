// Move callback outside to ensure it's always available globally for Google library
window.handleCredentialResponse = async (response) => {
    const loginError = document.getElementById('loginError');
    try {
        console.log("Google Login Response Received");
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);

        if (payload) {
            console.log("Google User:", payload.email);
            
            const res = await fetch('/api/auth/google-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: payload.email,
                    name: payload.name,
                    profileImage: payload.picture
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                localStorage.setItem('droneToken', data.token); 
                localStorage.setItem('userEmail', data.user.email);
                localStorage.setItem('userName', data.user.name);
                localStorage.setItem('userPicture', payload.picture);
                localStorage.setItem('isGoogleUser', 'true');
                window.location.href = '/index.html';
            } else {
                throw new Error(data.message || 'Server sync failed');
            }
        }
    } catch (error) {
        console.error("Google Login Error:", error);
        if (loginError) {
            loginError.textContent = 'Google Login failed. Please try again.';
            loginError.style.display = 'block';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const loginError = document.getElementById('loginError');

    if (form) {
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
                    localStorage.setItem('userName', data.user.name);
                    
                    if (data.user.role === 'admin') {
                        localStorage.setItem('adminToken', data.token);
                        window.location.href = '/admin.html';
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                } else {
                    loginError.textContent = data.message || 'Invalid credentials';
                    loginError.style.display = 'block';
                }
            } catch (err) {
                console.error("Login Error:", err);
                loginError.textContent = 'Server error, try again';
                loginError.style.display = 'block';
            }
        });
    }
});