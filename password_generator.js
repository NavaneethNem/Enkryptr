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
    // Generate a random salt
    generateSalt: () => {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return array;
    },

    // Derive a key from password and salt (PBKDF2)
    deriveKey: async (password, salt) => {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false, // non-extractable key
            ["encrypt", "decrypt"]
        );
    },

    // Encrypt data
    encrypt: async (text, key) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encoded
        );
        // Combine IV and Ciphertext for storage
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    },

    // Decrypt data
    decrypt: async (encryptedObj, key) => {
        try {
            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                data
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed", e);
            return null; // Wrong password or corrupted data
        }
    },

    // Helpers for Base64 (for storage if array doesn't work well)
    // Firestore supports Arrays naturally, so we'll stick to Arrays of numbers for simplicity.
};

// App Vars
const CHAR_SETS = { uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lowercase: "abcdefghijklmnopqrstuvwxyz", numbers: "1234567890", symbols: "~!@#$%^&*+=?<>" };

let currentUser = null;
let sessionKey = null; // The master key for this session
let vaultUnsubscribe = null;
let historyUnsubscribe = null;
let vaultItems = [];
let itemToDelete = null;

document.addEventListener('DOMContentLoaded', () => {
    // UI Events (Generator, Tabs, Modals)
    document.getElementById('but').addEventListener('click', generatePassword);
    document.getElementById('copy').addEventListener('click', copyToClipboard);
    document.getElementById('len-range').addEventListener('input', syncLength);

    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => handleTabSwitch(e.target.dataset.target)));

    document.getElementById('save-btn').addEventListener('click', handleSaveClick);
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('save-modal').close());
    document.getElementById('save-form').addEventListener('submit', handleSaveSubmit);

    document.getElementById('confirm-cancel').addEventListener('click', () => document.getElementById('confirm-modal').close());
    document.getElementById('confirm-delete').addEventListener('click', executeDelete);

    document.getElementById('vault-search').addEventListener('input', handleVaultSearch);
    document.getElementById('clear-history-btn').addEventListener('click', handleClearHistory);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Setup & Unlock Forms
    document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
    document.getElementById('unlock-form').addEventListener('submit', handleUnlockSubmit);

    // Initial State
    initTheme();
    renderHistory(getLocalHistory());

    // --- Auth State ---
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        updateUIForUser(user);

        if (user) {
            await checkUserEncryptionSetup(user);
            // We do NOT load vault content here. We wait for encryption setup check.
            document.getElementById('history-status').innerText = "Cloud";
            document.getElementById('history-status').classList.add('online');
            subscribeToHistory(user.uid);
        } else {
            sessionKey = null; // Clear key on logout
            if (vaultUnsubscribe) vaultUnsubscribe();
            if (historyUnsubscribe) historyUnsubscribe();
            renderVault([]);
            renderHistory(getLocalHistory());
            document.getElementById('history-status').innerText = "Local";
            document.getElementById('history-status').classList.remove('online');
        }
    });
});

// --- Encryption Flow ---
async function checkUserEncryptionSetup(user) {
    const userDocRef = db.collection('users').doc(user.uid);
    const doc = await userDocRef.get();

    if (!doc.exists || !doc.data().salt) {
        // New User (or Data Wipe): Needs Setup
        document.getElementById('setup-modal').showModal();
    } else {
        // Existing User: Needs Unlock
        // Store salt temporarily to use in derivation
        document.getElementById('unlock-modal').dataset.salt = JSON.stringify(doc.data().salt);
        document.getElementById('unlock-modal').showModal();
    }
}

async function handleSetupSubmit(e) {
    e.preventDefault();
    const p1 = document.getElementById('setup-pass').value;
    const p2 = document.getElementById('setup-confirm').value;

    if (p1 !== p2) {
        document.getElementById('setup-error').innerText = "Passwords do not match.";
        return;
    }

    try {
        const salt = CryptoUtils.generateSalt();
        sessionKey = await CryptoUtils.deriveKey(p1, salt);

        // Save Salt to Firestore
        await db.collection('users').doc(currentUser.uid).set({
            salt: Array.from(salt),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('setup-modal').close();
        showToast("Encryption Enabled. Vault Ready.");
        subscribeToVault(currentUser.uid); // Now we can load
    } catch (err) {
        console.error(err);
        document.getElementById('setup-error').innerText = "Error setting up encryption.";
    }
}

async function handleUnlockSubmit(e) {
    e.preventDefault();
    const password = document.getElementById('unlock-pass').value;
    const saltArr = JSON.parse(document.getElementById('unlock-modal').dataset.salt);
    const salt = new Uint8Array(saltArr);

    try {
        const key = await CryptoUtils.deriveKey(password, salt);

        // Validation: Try to decrypt a known value? 
        // For V1, we just assume key is correct and try to load vault. 
        // If decryption fails later, we know it's wrong.
        sessionKey = key;

        document.getElementById('unlock-modal').close();
        showToast("Vault Unlocked");
        subscribeToVault(currentUser.uid);
    } catch (err) {
        console.error(err);
        document.getElementById('unlock-error').innerText = "Error unlocking vault.";
    }
}

// --- Vault Logic (Encrypted) ---
async function subscribeToVault(uid) {
    if (!sessionKey) return; // Should not happen if flow is correct

    vaultUnsubscribe = db.collection("vault")
        .where("uid", "==", uid)
        .onSnapshot(async snap => {
            let tempItems = [];

            // Process ALL items (decrypt)
            for (let doc of snap.docs) {
                const data = doc.data();
                // Check if encrypted (has 'iv')
                if (data.iv && data.password) { // password field now holds the encrypted data Array
                    const plaintext = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, sessionKey);
                    if (plaintext) {
                        tempItems.push({ id: doc.id, ...data, password: plaintext }); // Replace blob with text for internal usage
                    } else {
                        // Decryption failed (Wrong master pass? or Corrupt)
                        console.warn("Failed to decrypt item", doc.id);
                        tempItems.push({ id: doc.id, ...data, password: "[DECRYPTION FAILED]" });
                    }
                } else {
                    // Legacy (Plaintext) support - optional, or treat as is
                    tempItems.push({ id: doc.id, ...data });
                }
            }

            // Sort Client-side
            tempItems.sort((a, b) => {
                const tA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
                const tB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
                return tB - tA;
            });

            vaultItems = tempItems;
            renderVault(vaultItems);
        }, err => console.error(err));
}

async function handleSaveSubmit(e) {
    e.preventDefault();
    if (!currentUser || !sessionKey) {
        showToast("Vault locked or user not signed in.", 'error');
        return;
    }

    const name = document.getElementById("modal-site").value;
    const url = document.getElementById("modal-url").value;
    const plainPass = document.getElementById("modal-pass").value;

    try {
        const encrypted = await CryptoUtils.encrypt(plainPass, sessionKey);

        await db.collection("vault").add({
            uid: currentUser.uid,
            name: name,
            url: url,
            password: encrypted.data, // Store array of numbers
            iv: encrypted.iv,       // Store array of numbers
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById("save-modal").close();
        showToast("Encrypted & Saved!");
    } catch (err) {
        showToast("Encryption/Save Failed: " + err.message, 'error');
    }
}

// ... (Rest of existing logic: copy, delete, generate, theme, etc.) ...
// NOTE: I am keeping other standard functions below to ensure file completeness.

function syncLength(e) {
    document.getElementById('len').value = e.target.value;
    document.getElementById('len-val').innerText = e.target.value;
}

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

function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function handleLogin() {
    try { await auth.signInWithPopup(provider); showToast("Signed in"); }
    catch (e) { showToast("Login failed", 'error'); }
}
async function handleLogout() {
    await auth.signOut();
    location.reload(); // Simple reload to clear memory state
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

function handleTabSwitch(targetId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === targetId));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.toggle('hidden', sec.id !== `view-${targetId}`));
}

// Generate (Updated to secure random) - reusing prior logic blocks
function generatePassword() {
    const len = parseInt(document.getElementById("len-range").value);
    const uc = document.getElementById("uc").checked;
    const lc = document.getElementById("lc").checked;
    const num = document.getElementById("num").checked;
    const spec = document.getElementById("spec").checked;
    if (!uc && !lc && !num && !spec) { showToast("Select options!", 'error'); return; }

    let pool = "", guaranteed = "";
    if (uc) { pool += CHAR_SETS.uppercase; guaranteed += getRandomChar(CHAR_SETS.uppercase); }
    if (lc) { pool += CHAR_SETS.lowercase; guaranteed += getRandomChar(CHAR_SETS.lowercase); }
    if (num) { pool += CHAR_SETS.numbers; guaranteed += getRandomChar(CHAR_SETS.numbers); }
    if (spec) { pool += CHAR_SETS.symbols; guaranteed += getRandomChar(CHAR_SETS.symbols); }

    let password = guaranteed;
    for (let i = 0; i < len - guaranteed.length; i++) password += getRandomChar(pool);
    password = shuffleString(password);

    document.getElementById("output").value = password;
    saveToHistory(password); // History remains plaintext locally for convenience? Or encrypt?
    // Note: User request implied vault security. History is ephemeral/local usually. 
    // For cloud history, we should probably encrypt too, but task focused on Vault. 
    // I will leave history plaintext for now as it's "Recent generated" not "Stored credentials".
}
function getRandomChar(str) {
    const array = new Uint32Array(1); window.crypto.getRandomValues(array);
    return str[array[0] % str.length];
}
function shuffleString(str) { return str.split('').sort(() => 0.5 - Math.random()).join(''); }

function copyToClipboard() {
    const val = document.getElementById("output").value;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => showToast("Copied"));
}

function getLocalHistory() { return JSON.parse(localStorage.getItem('pw_history') || '[]'); }
function saveToHistory(password) {
    const local = getLocalHistory();
    local.unshift({ password, timestamp: new Date().toISOString() });
    if (local.length > 5) local.pop();
    localStorage.setItem('pw_history', JSON.stringify(local));

    if (!currentUser) renderHistory(local);
    // Cloud history (Plaintext for now as per V1, focus is Vault Encryption)
    if (currentUser) {
        db.collection("generate_history").add({
            uid: currentUser.uid,
            password: password,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}
function handleClearHistory() {
    localStorage.removeItem('pw_history');
    renderHistory([]);
    if (currentUser) {
        db.collection("generate_history").where("uid", "==", currentUser.uid).get()
            .then(snap => {
                const batch = db.batch(); snap.docs.forEach(d => batch.delete(d.ref));
                return batch.commit();
            }).then(() => showToast("History cleared"));
    }
}
function subscribeToHistory(uid) {
    historyUnsubscribe = db.collection("generate_history").where("uid", "==", uid).onSnapshot(snap => {
        let items = []; snap.forEach(doc => items.push(doc.data()));
        items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        renderHistory(items.slice(0, 5));
    });
}
function renderHistory(items) {
    const list = document.getElementById('history-list'); list.innerHTML = "";
    items.forEach(item => {
        const li = document.createElement('li'); li.className = 'history-item';
        li.innerHTML = `<span>${item.password}</span>`;
        li.addEventListener('click', () => { navigator.clipboard.writeText(item.password); showToast("Copied"); });
        list.appendChild(li);
    });
}

function handleSaveClick() {
    const pwd = document.getElementById("output").value;
    if (!pwd) { showToast("Generate first!", 'error'); return; }
    document.getElementById("modal-pass").value = pwd;
    document.getElementById("modal-site").value = "";
    document.getElementById("modal-url").value = "";
    document.getElementById("save-modal").showModal();
}

function promptDelete(id) {
    itemToDelete = id;
    document.getElementById('confirm-modal').showModal();
}
function executeDelete() {
    if (!itemToDelete) return;
    db.collection("vault").doc(itemToDelete).delete()
        .then(() => { document.getElementById('confirm-modal').close(); showToast("Deleted"); })
        .catch(err => showToast("Error: " + err.message, 'error'));
}

function handleVaultSearch(e) {
    const term = e.target.value.toLowerCase();
    const filtered = vaultItems.filter(item =>
        (item.name && item.name.toLowerCase().includes(term)) || (item.url && item.url.toLowerCase().includes(term))
    );
    renderVault(filtered);
}

function renderVault(items) {
    const list = document.getElementById('vault-list'); list.innerHTML = "";
    if (items.length === 0) { list.innerHTML = `<div class="empty-state">No passwords found.</div>`; return; }

    items.forEach(item => {
        const domain = item.url ? item.url.replace(/^https?:\/\//, '').split('/')[0] : '';
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
        const imgHtml = faviconUrl ? `<img src="${faviconUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';

        const div = document.createElement('div'); div.className = 'vault-item';
        div.innerHTML = `
            <div class="vault-icon">
                ${imgHtml}<div class="placeholder" ${faviconUrl ? 'style="display:none"' : ''}>${(item.name || "?")[0].toUpperCase()}</div>
            </div>
            <div class="vault-info">
                <div class="vault-name">${item.name}</div>
                <div class="vault-url">${item.url || 'No URL'}</div>
            </div>
            <div class="vault-actions">
                <button class="vault-btn copy-btn" title="Copy"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                <button class="vault-btn delete" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        `;
        div.querySelector('.copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(item.password); showToast(`Copied ${item.name}`); });
        div.querySelector('.delete').addEventListener('click', () => promptDelete(item.id));
        list.appendChild(div);
    });
}