    document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const loginError = document.getElementById('login-error');

    // For demo purposes, we'll use these credentials
    const validCredentials = {
        email: 'demo@dronateen.com',
        password: 'demo123'
    };

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    function hideError(element) {
        element.style.display = 'none';
    }

    function handleLogin(e) {
        e.preventDefault();
        
        // Reset errors
        hideError(emailError);
        hideError(passwordError);
        hideError(loginError);

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        let hasError = false;

        // Validate email
        if (!email) {
            showError(emailError, 'Email is required');
            hasError = true;
        } else if (!validateEmail(email)) {
            showError(emailError, 'Please enter a valid email address');
            hasError = true;
        }

        // Validate password
        if (!password) {
            showError(passwordError, 'Password is required');
            hasError = true;
        }

        if (hasError) return;

        // Check credentials
        if (email === validCredentials.email && password === validCredentials.password) {
            // Store login state
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userEmail', email);
            
            // Redirect to main page
            window.location.href = 'index.html';
        } else {
            showError(loginError, 'Invalid email or password');
        }
    }

    loginForm.addEventListener('submit', handleLogin);
});