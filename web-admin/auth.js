/**
 * MediFlow SaaS — Auth Module
 * Handles JWT token storage, auth guard, and API request helper.
 * Load this BEFORE app.js in index.html.
 */

const AUTH_KEY = 'mediflow_auth';

/**
 * Get the stored auth object from localStorage.
 * Returns null if nothing stored.
 */
function getAuth() {
    try {
        return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    } catch (e) {
        return null;
    }
}

/**
 * Auth guard: call this at page load in index.html.
 * If not logged in, redirects to login.html and returns null.
 * Otherwise returns the auth object.
 */
function requireAuth() {
    const auth = getAuth();
    if (!auth || !auth.token) {
        window.location.href = 'login.html';
        return null;
    }
    if (auth.role === 'PATIENT') {
        localStorage.removeItem(AUTH_KEY);
        alert('Access Denied: Patient accounts are not permitted to access the Hospital Admin Portal. Please use the Patient App.');
        window.location.href = 'login.html';
        return null;
    }
    return auth;
}

/**
 * Logout: clears stored auth and redirects to login.
 */
function logout() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = 'login.html';
}

/**
 * Authenticated fetch helper.
 * Automatically adds Authorization: Bearer <token> header.
 */
function authFetch(url, options = {}) {
    const auth = getAuth();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (auth && auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
    }
    return fetch(url, { ...options, headers }).then(response => {
        if (response.status === 401) {
            localStorage.removeItem(AUTH_KEY);
            alert('Your session has expired. Please log in again.');
            window.location.href = 'login.html';
        }
        return response;
    });
}

/**
 * Get initials from a full name (e.g. "Sarah Staff" → "SS")
 */
function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * Role display label
 */
function getRoleLabel(role) {
    const map = {
        'HOSPITAL_ADMIN': 'Hospital Administrator',
        'STAFF':          'Hospital Staff / Caller',
        'DOCTOR':         'Medical Doctor',
        'SUPER_ADMIN':    'Super Admin',
        'PATIENT':        'Patient',
    };
    return map[role] || role;
}

/**
 * Subscription badge color class
 */
function getSubColor(color) {
    const map = { basic: '#94A3B8', pro: '#38BDF8', enterprise: '#FBBF24' };
    return map[color] || '#94A3B8';
}

/**
 * Format subscription plan text & CSS class from database string
 */
function formatSubscriptionPlan(plan) {
    const p = (plan || 'BASIC').toUpperCase();
    if (p === 'PRO') {
        return { label: '★ Pro Plan', className: 'sub-plan pro' };
    } else if (p === 'ENTERPRISE') {
        return { label: '◆ Enterprise Plan', className: 'sub-plan enterprise' };
    } else {
        return { label: '✦ Basic Plan (Free)', className: 'sub-plan basic' };
    }
}


