
const { createClient } = supabase;
// تهيئة Supabase
const supabaseUrl = 'https://soxwifnrwqkbfpvzdfkl.supabase.co';  
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHdpZm5yd3FrYmZwdnpkZmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NTkyNzMsImV4cCI6MjA4MDAzNTI3M30.44Jzm3XP35KPMJlE7YCZ9Yp95Y0bPJX2cCIJ2ogmYxw';  // استبدل بـ anon key من Supabase
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);  


const signUpForm = document.getElementById('signUpForm');
const signInForm = document.getElementById('signInForm');
const forgotContainer = document.getElementById('forgotContainer');
const forgotPasswordLink = document.getElementById('forgotPassword');
const finalgateLink      = document.getElementById('finalgateAccount');
const finalgateContainer = document.getElementById('finalgateContainer');
const closeFinalgate     = finalgateContainer.querySelector('.close');
const connectBtn         = document.getElementById('connectFinalgate');
const closeForgot = document.querySelector('.close');
const sendReset = document.getElementById('sendReset');

const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const container = document.getElementById('container');

signUpButton.addEventListener('click', () => {
    container.classList.add("right-panel-active");
});

signInButton.addEventListener('click', () => {
    container.classList.remove("right-panel-active");
});
signUpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = signUpForm.querySelector('input[placeholder="Full Name"]').value.trim();
    const factoryName = signUpForm.querySelector('input[placeholder="Factory Name"]').value.trim();
    const username = signUpForm.querySelector('input[placeholder="Username"]').value.trim();
    const email = signUpForm.querySelector('input[type="email"]').value.trim();
    const password = signUpForm.querySelector('input[type="password"]').value;

    if (!email || !password) {
        showNotification('Email and Password are required!');
        return;
    }

    try {
        // تسجيل المستخدم في Supabase
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { name, factoryName, username, role: 'admin' } // البيانات الإضافية
            }
        });

        if (error) {
            console.error('Supabase Error:', error);
            showNotification(`Sign up failed: ${error.message}`);
            return;
        }

        console.log('Sign up data:', data);
        showNotification('Signup successful! Check your email to confirm your account.');
        signUpForm.reset();
        container.classList.remove("right-panel-active");

    } catch (err) {
        console.error('Unexpected error:', err);
        showNotification('An unexpected error occurred: ' + err.message);
    }
});



signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = signInForm.querySelector('input[type="email"]').value.trim();
    const password = signInForm.querySelector('input[type="password"]').value;

    if (!email || !password) {
        showNotification('Email and Password are required!');
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showNotification(`Login failed: ${error.message}`);
            return;
        }

        if (data?.user) {
            // تسجيل الدخول ناجح
            showNotification(`Welcome back, ${email}!`);
            window.location.href = './lib/login.html';
        }
    } catch (err) {
        showNotification('An unexpected error occurred: ' + err.message);
        console.error(err);
    }
});

finalgateLink.addEventListener('click', (e) => {
    e.preventDefault();           // prevent default link behavior
    finalgateContainer.style.display = 'block';
});

// Close overlay
closeFinalgate.addEventListener('click', () => {
    finalgateContainer.style.display = 'none';
});

connectBtn.addEventListener('click', async () => {

    const email1 = document.getElementById('finalgateEmail').value.trim();
    const password = document.getElementById('finalgatePassword').value.trim();

    if (!email1 || !password) {
        showNotification('Please fill in both email and password');
        return;
    }

    try {

        // تحقق من المستخدم في جدول الشركة
        const { data: userCompany, error: userError } = await supabaseClient
            .from('userscompany')
            .select('id, username1, role, email1')
            .eq('email1', email1)
            .single();

        if (userError || !userCompany) {
            showNotification('Account not found in company system');
            return;
        }

        // تسجيل الدخول في Supabase Auth
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email1,   // 🔥 هنا التصحيح
            password: password
        });

        if (error) {
            showNotification('Invalid email or password');
            return;
        }

        console.log("User Company Info:", userCompany);
        console.log("Auth User:", data.user);

        showNotification('Connected successfully');

        finalgateContainer.style.display = 'none';

        setTimeout(() => {
            window.location.href = "./lib/login.html";
        }, 800);

    } catch (err) {
        console.error(err);
        showNotification('Connection error');
    }

});




forgotPasswordLink.addEventListener('click', () => {
    forgotContainer.style.display = 'block';
});

closeForgot.addEventListener('click', () => {
    forgotContainer.style.display = 'none';
});

sendReset.addEventListener('click', () => {
    const resetEmail = document.getElementById('resetEmail').value.trim();
    let users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => u.email === resetEmail);

    if(!user) {
        showNotification('Email not found!');
        return;
    }

    showNotification('Password reset link sent to your email! (Simulated)');
    forgotContainer.style.display = 'none';
});






function showNotification(message, duration = 3000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}


