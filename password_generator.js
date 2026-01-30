// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAoPZNwZgKg210fKa7nDudl5pHZ6qJA6Kc",
    authDomain: "enkryptr.firebaseapp.com",
    projectId: "enkryptr",
    storageBucket: "enkryptr.firebasestorage.app",
    messagingSenderId: "275810501454",
    appId: "1:275810501454:web:064cedc4e3a9a43fec541f"
};

// Initialize Firebase (Compat)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// App Vars
const CHAR_SETS = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "1234567890",
    symbols: "~!@#$%^&*+=?<>",
};

let currentUser = null;
let historyUnsubscribe = null;
let vaultUnsubscribe = null;
let vaultItems = [];
let itemToDelete = null;

document.addEventListener('DOMContentLoaded', () => {
    // --- Generator Events ---
    document.getElementById('but').addEventListener('click', generatePassword);
    document.getElementById('copy').addEventListener('click', copyToClipboard);
    document.getElementById('len-range').addEventListener('input', syncLength);

    // --- Auth Events ---
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // --- Tab Events ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleTabSwitch(e.target.dataset.target));
    });

    // --- Modal Events ---
    document.getElementById('save-btn').addEventListener('click', handleSaveClick);
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('save-modal').close());
    document.getElementById('save-form').addEventListener('submit', handleSaveSubmit);

    // Confirm Delete Modal
    document.getElementById('confirm-cancel').addEventListener('click', () => document.getElementById('confirm-modal').close());
    document.getElementById('confirm-delete').addEventListener('click', executeDelete);

    // --- Vault & History Events ---
    document.getElementById('vault-search').addEventListener('input', handleVaultSearch);
    document.getElementById('clear-history-btn').addEventListener('click', handleClearHistory);

    // --- Theme Events ---
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Initial State
    initTheme();
    renderHistory(getLocalHistory());

    // --- Auth State ---
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateUIForUser(user);

        if (user) {
            subscribeToHistory(user.uid);
            subscribeToVault(user.uid);
            document.getElementById('history-status').innerText = "Cloud";
            document.getElementById('history-status').classList.add('online');
        } else {
            if (historyUnsubscribe) historyUnsubscribe();
            if (vaultUnsubscribe) vaultUnsubscribe();

            vaultItems = [];
            renderVault(vaultItems);

            renderHistory(getLocalHistory());
            document.getElementById('history-status').innerText = "Local";
            document.getElementById('history-status').classList.remove('online');
        }
    });
});

function syncLength(e) {
    const val = e.target.value;
    document.getElementById('len').value = val;
    document.getElementById('len-val').innerText = val;
}

// --- Theme ---
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') applyTheme('dark');
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
}

function applyTheme(theme) {
    const sun = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');

    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
    } else {
        document.body.classList.remove('dark-mode');
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
    }
}

// --- Toast System ---
function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    // Trigger Animation
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Auth ---
async function handleLogin() {
    try {
        await auth.signInWithPopup(provider);
        showToast("Signed in successfully");
    } catch (error) {
        console.error("Login Error:", error);
        showToast("Login failed", 'error');
    }
}
async function handleLogout() {
    await auth.signOut();
    showToast("Signed out");
}

function updateUIForUser(user) {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const saveBtn = document.getElementById('save-btn');
    const vaultMsg = document.getElementById('vault-login-msg');

    if (user) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        document.getElementById('user-photo').src = user.photoURL;
        document.getElementById('user-name').innerText = user.displayName.split(' ')[0];
        saveBtn.classList.remove('hidden');
        vaultMsg.classList.add('hidden');
    } else {
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        saveBtn.classList.add('hidden');
        vaultMsg.classList.remove('hidden');
    }
}

// --- Tabs ---
function handleTabSwitch(targetId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.toggle('hidden', sec.id !== `view-${targetId}`);
    });
}

// --- Generator ---
function generatePassword() {
    const len = parseInt(document.getElementById("len-range").value);
    const uc = document.getElementById("uc").checked;
    const lc = document.getElementById("lc").checked;
    const num = document.getElementById("num").checked;
    const spec = document.getElementById("spec").checked;

    if (!uc && !lc && !num && !spec) {
        showToast("Select at least one option!", 'error');
        return;
    }
    document.getElementById("error-msg").innerText = "";

    let pool = "";
    let guaranteed = "";
    if (uc) { pool += CHAR_SETS.uppercase; guaranteed += getRandomChar(CHAR_SETS.uppercase); }
    if (lc) { pool += CHAR_SETS.lowercase; guaranteed += getRandomChar(CHAR_SETS.lowercase); }
    if (num) { pool += CHAR_SETS.numbers; guaranteed += getRandomChar(CHAR_SETS.numbers); }
    if (spec) { pool += CHAR_SETS.symbols; guaranteed += getRandomChar(CHAR_SETS.symbols); }

    let password = guaranteed;
    for (let i = 0; i < len - guaranteed.length; i++) {
        password += getRandomChar(pool);
    }
    password = shuffleString(password);

    document.getElementById("output").value = password;
    saveToHistory(password);
}

function getSecureRandomInt(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
}
function getRandomChar(str) { return str[getSecureRandomInt(str.length)]; }
function shuffleString(str) {
    return str.split('').sort(() => 0.5 - Math.random()).join('');
}

function copyToClipboard() {
    const val = document.getElementById("output").value;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.getElementById("copy");
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => btn.innerHTML = originalHtml, 2000);
        showToast("Copied to clipboard");
    });
}

// --- History ---
function getLocalHistory() {
    return JSON.parse(localStorage.getItem('pw_history') || '[]');
}
function saveToHistory(password) {
    const local = getLocalHistory();
    local.unshift({ password, timestamp: new Date().toISOString() });
    if (local.length > 5) local.pop();
    localStorage.setItem('pw_history', JSON.stringify(local));

    if (!currentUser) renderHistory(local);

    if (currentUser) {
        db.collection("generate_history").add({
            uid: currentUser.uid,
            password: password,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

function handleClearHistory() {
    // 1. Clear Local
    localStorage.removeItem('pw_history');
    renderHistory([]);

    // 2. Clear Cloud (if logged in)
    if (currentUser) {
        db.collection("generate_history").where("uid", "==", currentUser.uid).get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                return batch.commit();
            }).then(() => {
                showToast("History cleared");
            }).catch(err => showToast("Error clearing history", 'error'));
    } else {
        showToast("Local history cleared");
    }
}

function subscribeToHistory(uid) {
    historyUnsubscribe = db.collection("generate_history")
        .where("uid", "==", uid)
        .onSnapshot(snap => {
            let items = [];
            snap.forEach(doc => items.push(doc.data()));
            items.sort((a, b) => { // Client-side sort
                const tA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
                const tB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
                return tB - tA;
            });
            renderHistory(items.slice(0, 5));
        });
}

function renderHistory(items) {
    const list = document.getElementById('history-list');
    list.innerHTML = "";
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        let timeStr = "";
        if (item.timestamp && item.timestamp.seconds) timeStr = new Date(item.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        else if (item.timestamp) timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        li.innerHTML = `<span>${item.password}</span><span style="color:#aaa;font-size:0.8em">${timeStr}</span>`;
        li.addEventListener('click', () => {
            navigator.clipboard.writeText(item.password);
            showToast("Password copied");
        });
        list.appendChild(li);
    });
}

// --- Vault Logic ---
function handleSaveClick() {
    const pwd = document.getElementById("output").value;
    if (!pwd) { showToast("Generate a password first!", 'error'); return; }

    document.getElementById("modal-pass").value = pwd;
    document.getElementById("modal-site").value = "";
    document.getElementById("modal-url").value = "";
    document.getElementById("save-modal").showModal();
}

function handleSaveSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const name = document.getElementById("modal-site").value;
    const url = document.getElementById("modal-url").value;
    const password = document.getElementById("modal-pass").value;

    db.collection("vault").add({
        uid: currentUser.uid,
        name: name,
        url: url,
        password: password,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        document.getElementById("save-modal").close();
        showToast("Saved to Vault!");
    }).catch(err => showToast("Error: " + err.message, 'error'));
}

function promptDelete(id) {
    itemToDelete = id;
    document.getElementById('confirm-modal').showModal();
}

function executeDelete() {
    if (!itemToDelete || !currentUser) return;

    db.collection("vault").doc(itemToDelete).delete()
        .then(() => {
            document.getElementById('confirm-modal').close();
            showToast("Item deleted");
            itemToDelete = null;
        })
        .catch(err => {
            document.getElementById('confirm-modal').close();
            showToast("Error deleting: " + err.message, 'error');
        });
}

function subscribeToVault(uid) {
    vaultUnsubscribe = db.collection("vault")
        .where("uid", "==", uid)
        .onSnapshot(snap => {
            vaultItems = [];
            snap.forEach(doc => {
                vaultItems.push({ id: doc.id, ...doc.data() });
            });
            vaultItems.sort((a, b) => { // Client-side sort
                const tA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
                const tB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
                return tB - tA;
            });
            renderVault(vaultItems);
        }, err => console.error(err));
}

function handleVaultSearch(e) {
    const term = e.target.value.toLowerCase();
    const filtered = vaultItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(term)) ||
        (item.url && item.url.toLowerCase().includes(term))
    );
    renderVault(filtered);
}

function renderVault(items) {
    const list = document.getElementById('vault-list');
    list.innerHTML = "";

    if (items.length === 0) {
        list.innerHTML = `<div class="empty-state">No passwords found.</div>`;
        return;
    }

    items.forEach(item => {
        const domain = item.url ? item.url.replace(/^https?:\/\//, '').split('/')[0] : '';
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
        const imgHtml = faviconUrl ? `<img src="${faviconUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';

        const div = document.createElement('div');
        div.className = 'vault-item';
        div.innerHTML = `
            <div class="vault-icon">
                ${imgHtml}
                <div class="placeholder" ${faviconUrl ? 'style="display:none"' : ''}>${(item.name || "?")[0].toUpperCase()}</div>
            </div>
            <div class="vault-info">
                <div class="vault-name">${item.name}</div>
                <div class="vault-url">${item.url || 'No URL'}</div>
            </div>
            <div class="vault-actions">
                <button class="vault-btn copy-btn" title="Copy">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="vault-btn delete" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;

        div.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(item.password);
            showToast(`Copied ${item.name}`);
        });

        div.querySelector('.delete').addEventListener('click', () => {
            promptDelete(item.id);
        });

        list.appendChild(div);
    });
}