// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAoPZNwZgKg210fKa7nDudl5pHZ6qJA6Kc",
    authDomain: "enkryptr.firebaseapp.com",
    projectId: "enkryptr",
    storageBucket: "enkryptr.firebasestorage.app",
    messagingSenderId: "275810501454",
    appId: "1:275810501454:web:064cedc4e3a9a43fec541f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// --- Crypto Utils ---
const CryptoUtils = {
    generateSalt: () => {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return array;
    },
    deriveKey: async (password, salt) => {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    },
    encrypt: async (text, key) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    },
    decrypt: async (encryptedObj, key) => {
        try {
            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed", e);
            throw new Error("Wrong Password"); // Explicit error
        }
    }
};

// App Vars
const CHAR_SETS = { uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lowercase: "abcdefghijklmnopqrstuvwxyz", numbers: "1234567890", symbols: "~!@#$%^&*+=?<>" };
let currentUser = null;
let sessionKey = null;
let vaultUnsubscribe = null;
let historyUnsubscribe = null;
let vaultItems = [];
let itemToDelete = null;

document.addEventListener('DOMContentLoaded', () => {
    // UI Events
    document.getElementById('but').addEventListener('click', generatePassword);
    document.getElementById('copy').addEventListener('click', copyToClipboard);
    document.getElementById('len-range').addEventListener('input', syncLength);

    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Unlock modal logout
    document.getElementById('unlock-logout').addEventListener('click', () => {
        document.getElementById('unlock-modal').close();
        handleLogout();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => handleTabSwitch(e.target.dataset.target)));

    document.getElementById('save-btn').addEventListener('click', handleSaveClick);
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('save-modal').close());
    document.getElementById('save-form').addEventListener('submit', handleSaveSubmit);

    document.getElementById('confirm-cancel').addEventListener('click', () => document.getElementById('confirm-modal').close());
    document.getElementById('confirm-delete').addEventListener('click', executeDelete);

    document.getElementById('vault-search').addEventListener('input', handleVaultSearch);
    document.getElementById('clear-history-btn').addEventListener('click', handleClearHistory);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
    document.getElementById('unlock-form').addEventListener('submit', handleUnlockSubmit);

    initTheme();
    renderHistory(getLocalHistory());

    // --- Auth State ---
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        updateUIForUser(user);

        if (user) {
            try {
                await checkUserEncryptionSetup(user);
            } catch (err) {
                console.error("Auth Flow Error:", err);
                showToast("Error: Check Console", 'error');
            }
        } else {
            sessionKey = null;
            if (vaultUnsubscribe) vaultUnsubscribe();
            if (historyUnsubscribe) historyUnsubscribe();
            renderVault([]);
            renderHistory(getLocalHistory()); // Back to local only
            document.getElementById('history-status').innerText = "Local";
            document.getElementById('history-status').classList.remove('online');
        }
    });
});

async function checkUserEncryptionSetup(user) {
    const userDocRef = db.collection('users').doc(user.uid);
    const doc = await userDocRef.get();

    if (!doc.exists || !doc.data().salt) {
        document.getElementById('setup-modal').showModal();
    } else {
        const data = doc.data();
        document.getElementById('unlock-modal').dataset.salt = JSON.stringify(data.salt);
        // Store validation challenge if it exists, otherwise we might need to migrate
        if (data.challenge) {
            document.getElementById('unlock-modal').dataset.challenge = JSON.stringify(data.challenge);
        }
        document.getElementById('unlock-modal').showModal();
    }
}

async function handleSetupSubmit(e) {
    e.preventDefault();
    const p1 = document.getElementById('setup-pass').value;
    const p2 = document.getElementById('setup-confirm').value;

    if (p1.length < 8) { document.getElementById('setup-error').innerText = "Too short (min 8 chars)."; return; }
    if (p1 !== p2) { document.getElementById('setup-error').innerText = "Passwords do not match."; return; }

    try {
        const salt = CryptoUtils.generateSalt();
        const key = await CryptoUtils.deriveKey(p1, salt);

        // Create Verification Challenge
        const challenge = await CryptoUtils.encrypt("VALIDATION_TOKEN", key);

        await db.collection('users').doc(currentUser.uid).set({
            salt: Array.from(salt),
            challenge: challenge, // Store the challenge
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        sessionKey = key;
        document.getElementById('setup-modal').close();
        showToast("Encryption Enabled.");
        startSession();
    } catch (err) {
        console.error(err);
        document.getElementById('setup-error').innerText = "Error: " + err.message;
    }
}

async function handleUnlockSubmit(e) {
    e.preventDefault();
    const password = document.getElementById('unlock-pass').value;
    const saltArr = JSON.parse(document.getElementById('unlock-modal').dataset.salt || "[]");
    const challengeRaw = document.getElementById('unlock-modal').dataset.challenge; // Might be undefined for old users

    if (saltArr.length === 0) { showToast("Error: No salt found. Reset data required.", 'error'); return; }

    try {
        const salt = new Uint8Array(saltArr);
        const key = await CryptoUtils.deriveKey(password, salt);

        // --- Verify Password ---
        if (challengeRaw) {
            const challengeObj = JSON.parse(challengeRaw);
            try {
                const result = await CryptoUtils.decrypt(challengeObj, key);
                if (result !== "VALIDATION_TOKEN") throw new Error("Invalid Token");
            } catch (decErr) {
                // Decryption failed = Wrong Password
                document.getElementById('unlock-error').innerText = "Incorrect Master Password.";
                document.getElementById('unlock-pass').value = "";
                document.getElementById('unlock-pass').focus();
                return; // STOP HERE
            }
        }

        // If we get here, password is correct
        sessionKey = key;
        document.getElementById('unlock-modal').close();
        showToast("Vault Unlocked");
        startSession();

    } catch (err) {
        console.error(err);
        document.getElementById('unlock-error').innerText = "Error unlocking: " + err.message;
    }
}

function startSession() {
    subscribeToVault(currentUser.uid);
    subscribeToHistory(currentUser.uid); // Now using encrypted history
    document.getElementById('history-status').innerText = "Cloud (Encrypted)";
    document.getElementById('history-status').classList.add('online');
}

// --- Vault Logic ---
async function subscribeToVault(uid) {
    if (!sessionKey) return;
    vaultUnsubscribe = db.collection("vault").where("uid", "==", uid).onSnapshot(async snap => {
        let tempItems = [];
        for (let doc of snap.docs) {
            const data = doc.data();
            if (data.iv && data.password && Array.isArray(data.password)) {
                try {
                    const plaintext = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, sessionKey);
                    tempItems.push({ id: doc.id, ...data, password: plaintext });
                } catch (e) {
                    tempItems.push({ id: doc.id, ...data, password: "[DECRYPTION FAILED]" });
                }
            } else {
                tempItems.push({ id: doc.id, ...data }); // Legacy/Plaintext
            }
        }
        tempItems.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        vaultItems = tempItems;
        renderVault(vaultItems);
    }, err => console.error(err));
}

async function handleSaveSubmit(e) {
    e.preventDefault();
    if (!currentUser || !sessionKey) { showToast("Vault locked.", 'error'); return; }

    const name = document.getElementById("modal-site").value;
    const url = document.getElementById("modal-url").value;
    const plainPass = document.getElementById("modal-pass").value;

    try {
        const encrypted = await CryptoUtils.encrypt(plainPass, sessionKey);
        await db.collection("vault").add({
            uid: currentUser.uid, name, url,
            password: encrypted.data, iv: encrypted.iv,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById("save-modal").close();
        showToast("Encrypted & Saved!");
    } catch (err) { showToast("Save Failed: " + err.message, 'error'); }
}

// --- History Logic (Updated) ---
function getLocalHistory() { return JSON.parse(localStorage.getItem('pw_history') || '[]'); }

async function saveToHistory(password) {
    // 1. If Logged In: Save to Cloud Only (Encrypted)
    if (currentUser) {
        if (!sessionKey) return; // If locked, maybe don't save history? Or buffer? For now, skip.
        try {
            const encrypted = await CryptoUtils.encrypt(password, sessionKey);
            db.collection("generate_history").add({
                uid: currentUser.uid,
                password: encrypted.data, iv: encrypted.iv, // Encrypted!
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.error("History Encrypt Fail", e); }
    }
    // 2. If Logged Out: Save to Local Storage
    else {
        const local = getLocalHistory();
        local.unshift({ password, timestamp: new Date().toISOString() });
        if (local.length > 5) local.pop();
        localStorage.setItem('pw_history', JSON.stringify(local));
        renderHistory(local);
    }
}

function subscribeToHistory(uid) {
    if (!sessionKey) return;
    historyUnsubscribe = db.collection("generate_history").where("uid", "==", uid).onSnapshot(async snap => {
        let items = [];
        for (let doc of snap.docs) {
            const data = doc.data();
            if (data.iv && data.password && Array.isArray(data.password)) {
                try {
                    const plaintext = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, sessionKey);
                    items.push({ ...data, password: plaintext });
                } catch (e) {
                    items.push({ ...data, password: "???" });
                }
            } else {
                items.push(data); // Legacy
            }
        }
        items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        renderHistory(items.slice(0, 5));
    });
}

// ... Rest of UI logic (Generate, Copy, Theme, etc) unchanged ...
function syncLength(e) { document.getElementById('len').value = e.target.value; document.getElementById('len-val').innerText = e.target.value; }
function initTheme() { const t = localStorage.getItem('theme') || 'light'; if (t === 'dark') applyTheme('dark'); }
function toggleTheme() { const isDark = document.body.classList.contains('dark-mode'); applyTheme(isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); }
function applyTheme(t) {
    const s = document.getElementById('icon-sun'), m = document.getElementById('icon-moon');
    if (t === 'dark') { document.body.classList.add('dark-mode'); s.classList.remove('hidden'); m.classList.add('hidden'); }
    else { document.body.classList.remove('dark-mode'); s.classList.add('hidden'); m.classList.remove('hidden'); }
}
function showToast(msg, type = 'normal') {
    const c = document.getElementById('toast-container'), t = document.createElement('div');
    t.className = `toast ${type}`; t.innerText = msg; c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 3000);
}
async function handleLogin() { try { await auth.signInWithPopup(provider); showToast("Signed in"); } catch (e) { showToast("Login failed", 'error'); } }
async function handleLogout() { localStorage.removeItem('pw_history'); await auth.signOut(); location.reload(); }
function updateUIForUser(u) {
    const l = document.getElementById('login-btn'), i = document.getElementById('user-info'), s = document.getElementById('save-btn'), v = document.getElementById('vault-login-msg');
    if (u) { l.classList.add('hidden'); i.classList.remove('hidden'); document.getElementById('user-photo').src = u.photoURL; document.getElementById('user-name').innerText = u.displayName.split(' ')[0]; s.classList.remove('hidden'); v.classList.add('hidden'); }
    else { l.classList.remove('hidden'); i.classList.add('hidden'); s.classList.add('hidden'); v.classList.remove('hidden'); }
}
function handleTabSwitch(id) { document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.target === id)); document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('hidden', s.id !== `view-${id}`)); }
function generatePassword() {
    const l = parseInt(document.getElementById("len-range").value), uc = document.getElementById("uc").checked, lc = document.getElementById("lc").checked, num = document.getElementById("num").checked, spec = document.getElementById("spec").checked;
    if (!uc && !lc && !num && !spec) { showToast("Select options!", 'error'); return; }
    let pool = "", g = "";
    if (uc) { pool += CHAR_SETS.uppercase; g += getRandomChar(CHAR_SETS.uppercase); }
    if (lc) { pool += CHAR_SETS.lowercase; g += getRandomChar(CHAR_SETS.lowercase); }
    if (num) { pool += CHAR_SETS.numbers; g += getRandomChar(CHAR_SETS.numbers); }
    if (spec) { pool += CHAR_SETS.symbols; g += getRandomChar(CHAR_SETS.symbols); }
    let p = g; for (let i = 0; i < l - g.length; i++)p += getRandomChar(pool);
    p = shuffleString(p); document.getElementById("output").value = p; saveToHistory(p);
}
function getRandomChar(s) { const a = new Uint32Array(1); window.crypto.getRandomValues(a); return s[a[0] % s.length]; }
function shuffleString(s) { return s.split('').sort(() => 0.5 - Math.random()).join(''); }
function copyToClipboard() { const v = document.getElementById("output").value; if (!v) return; navigator.clipboard.writeText(v).then(() => showToast("Copied")); }
function handleClearHistory() {
    localStorage.removeItem('pw_history'); renderHistory([]);
    if (currentUser) { db.collection("generate_history").where("uid", "==", currentUser.uid).get().then(s => { const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); return b.commit(); }).then(() => showToast("History cleared")); }
}
function renderHistory(items) {
    const list = document.getElementById('history-list'); list.innerHTML = "";
    items.forEach(i => {
        const li = document.createElement('li'); li.className = 'history-item';
        li.innerHTML = `<span>${i.password}</span>`;
        li.addEventListener('click', () => { navigator.clipboard.writeText(i.password); showToast("Copied"); });
        list.appendChild(li);
    });
}
function handleSaveClick() {
    const p = document.getElementById("output").value;
    if (!p) { showToast("Generate first!", 'error'); return; }
    if (currentUser && !sessionKey) { showToast("Unlock Vault first", 'error'); checkUserEncryptionSetup(currentUser); return; }
    document.getElementById("modal-pass").value = p; document.getElementById("modal-site").value = ""; document.getElementById("modal-url").value = ""; document.getElementById("save-modal").showModal();
}
function promptDelete(id) { itemToDelete = id; document.getElementById('confirm-modal').showModal(); }
function executeDelete() { if (!itemToDelete) return; db.collection("vault").doc(itemToDelete).delete().then(() => { document.getElementById('confirm-modal').close(); showToast("Deleted"); }).catch(e => showToast("Error: " + e.message, 'error')); }
function handleVaultSearch(e) { const t = e.target.value.toLowerCase(); renderVault(vaultItems.filter(i => (i.name && i.name.toLowerCase().includes(t)) || (i.url && i.url.toLowerCase().includes(t)))); }
function renderVault(items) {
    const l = document.getElementById('vault-list'); l.innerHTML = "";
    if (items.length === 0) { l.innerHTML = `<div class="empty-state">No passwords found.</div>`; return; }
    items.forEach(i => {
        const d = i.url ? i.url.replace(/^https?:\/\//, '').split('/')[0] : '', f = d ? `https://www.google.com/s2/favicons?domain=${d}&sz=64` : '', img = f ? `<img src="${f}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
        const div = document.createElement('div'); div.className = 'vault-item';
        div.innerHTML = `<div class="vault-icon">${img}<div class="placeholder" ${f ? 'style="display:none"' : ''}>${(i.name || "?")[0].toUpperCase()}</div></div><div class="vault-info"><div class="vault-name">${i.name}</div><div class="vault-url">${i.url || 'No URL'}</div></div><div class="vault-actions"><button class="vault-btn copy-btn" title="Copy"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="vault-btn delete" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>`;
        div.querySelector('.copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(i.password); showToast(`Copied ${i.name}`); });
        div.querySelector('.delete').addEventListener('click', () => promptDelete(i.id));
        l.appendChild(div);
    });
}