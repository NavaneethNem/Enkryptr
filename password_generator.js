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

// --- Crypto Utils (Enhanced) ---
const CryptoUtils = {
    CONSTANTS: {
        ALG: "AES-GCM",
        HASH: "SHA-256",
        ITERATIONS_NEW: 500000, // Upgrade to 500k
        ITERATIONS_LEGACY: 100000
    },

    generateSalt: () => {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return array;
    },

    deriveKey: async (password, salt, iterations) => {
        const iter = iterations || CryptoUtils.CONSTANTS.ITERATIONS_LEGACY;
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: iter, hash: CryptoUtils.CONSTANTS.HASH },
            keyMaterial, { name: CryptoUtils.CONSTANTS.ALG, length: 256 }, false, ["encrypt", "decrypt"]
        );
    },

    encrypt: async (text, key) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await window.crypto.subtle.encrypt({ name: CryptoUtils.CONSTANTS.ALG, iv: iv }, key, encoded);

        // Structured Payload with Metadata
        return {
            v: 1,
            alg: "AES-GCM-256",
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    },

    decrypt: async (encryptedObj, key) => {
        try {
            // Validation
            if (!encryptedObj.iv || !encryptedObj.data) throw new Error("Invalid Ciphertext Format");

            // Check Version (Support Legacy)
            if (encryptedObj.v === 1) {
                if (encryptedObj.alg !== "AES-GCM-256") throw new Error("Unsupported Algorithm");
            }

            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            const decrypted = await window.crypto.subtle.decrypt({ name: CryptoUtils.CONSTANTS.ALG, iv: iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Crypto Op Failed:", e);
            throw new Error("Decryption Failed: Key mismatch or data corruption");
        }
    }
};

// --- Secure Password Generator ---
function getSecureRandomInt(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
}

function secureShuffle(array) {
    // Fisher-Yates Shuffle with Crypto Random
    for (let i = array.length - 1; i > 0; i--) {
        const j = getSecureRandomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array.join('');
}

function generatePassword() {
    const l = parseInt(document.getElementById("len-range").value);
    const uc = document.getElementById("uc").checked;
    const lc = document.getElementById("lc").checked;
    const num = document.getElementById("num").checked;
    const spec = document.getElementById("spec").checked;

    if (!uc && !lc && !num && !spec) { showToast("Select options!", 'error'); return; }

    let pool = "";
    let mandatory = [];

    if (uc) { pool += CHAR_SETS.uppercase; mandatory.push(CHAR_SETS.uppercase[getSecureRandomInt(CHAR_SETS.uppercase.length)]); }
    if (lc) { pool += CHAR_SETS.lowercase; mandatory.push(CHAR_SETS.lowercase[getSecureRandomInt(CHAR_SETS.lowercase.length)]); }
    if (num) { pool += CHAR_SETS.numbers; mandatory.push(CHAR_SETS.numbers[getSecureRandomInt(CHAR_SETS.numbers.length)]); }
    if (spec) { pool += CHAR_SETS.symbols; mandatory.push(CHAR_SETS.symbols[getSecureRandomInt(CHAR_SETS.symbols.length)]); }

    let finalPass = mandatory; // Start with mandatory chars
    const remaining = l - mandatory.length;

    for (let i = 0; i < remaining; i++) {
        finalPass.push(pool[getSecureRandomInt(pool.length)]);
    }

    // Shuffle efficiently
    const p = secureShuffle(finalPass);

    document.getElementById("output").value = p;
    saveToHistory(p);
}

// App Vars
const CHAR_SETS = { uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lowercase: "abcdefghijklmnopqrstuvwxyz", numbers: "1234567890", symbols: "~!@#$%^&*+=?<>" };
let currentUser = null;
let sessionKey = null;
let vaultUnsubscribe = null;
let historyUnsubscribe = null;
let vaultItems = [];
let itemToDelete = null;

// Auto-Lock Config
let inactivityTimer;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 Minutes

document.addEventListener('DOMContentLoaded', () => {
    // UI Events
    document.getElementById('but').addEventListener('click', generatePassword);
    document.getElementById('copy').addEventListener('click', () => {
        const val = document.getElementById('output').value;
        if (val) copyToClipboard(val);
        else showToast("Generate a password first!", "error");
    });
    document.getElementById('len-range').addEventListener('input', syncLength);
    document.getElementById('login-btn').addEventListener('click', handleLogin);

    // Dropdown Events
    const dropdownContainer = document.querySelector('.user-profile-trigger');
    const dropdownMenu = document.getElementById('user-dropdown');

    if (dropdownContainer) {
        dropdownContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!dropdownContainer.contains(e.target)) dropdownMenu.classList.add('hidden');
        });
    }

    document.getElementById('menu-logout').addEventListener('click', handleLogout);
    document.getElementById('menu-reset').addEventListener('click', window.resetAccount);
    document.getElementById('menu-change-pass').addEventListener('click', () => {
        if (!sessionKey) { showToast("Unlock vault first!", 'error'); return; }
        document.getElementById('change-pass-modal').showModal();
    });

    // Modal Events
    document.getElementById('cp-cancel').addEventListener('click', () => document.getElementById('change-pass-modal').close());
    document.getElementById('change-pass-form').addEventListener('submit', handleChangePasswordSubmit);

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

    // Unlock modal logout
    if (document.getElementById('unlock-logout')) {
        document.getElementById('unlock-logout').addEventListener('click', () => {
            document.getElementById('unlock-modal').close();
            handleLogout();
        });
    }

    initTheme();
    renderHistory(getLocalHistory());

    // --- Auth State ---
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        updateUIForUser(user);

        if (user) {
            try { await checkUserEncryptionSetup(user); }
            catch (err) { console.error("Auth Flow Error:", err); showToast("Error: Check Permissions", 'error'); }
        } else {
            sessionKey = null;
            if (vaultUnsubscribe) vaultUnsubscribe();
            if (historyUnsubscribe) historyUnsubscribe();
            vaultItems = [];
            renderVault([]);
            renderHistory(getLocalHistory());
            document.getElementById('history-status').innerText = "Local";
            document.getElementById('history-status').classList.remove('online');
        }
    });
});

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const oldPass = document.getElementById('cp-old').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;

    if (newPass !== confirmPass) { document.getElementById('cp-error').innerText = "New passwords don't match"; return; }
    if (newPass.length < 8) { document.getElementById('cp-error').innerText = "Too short (min 8 chars)"; return; }

    try {
        showToast("Processing... Do NOT close.", 'normal');

        // 1. Verify Old Password by deriving key and checking challenge
        // Note: We use the *stored salt*, not a new one.
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const storedSalt = new Uint8Array(userDoc.data().salt);
        const storedChallenge = userDoc.data().challenge;

        const oldKey = await CryptoUtils.deriveKey(oldPass, storedSalt);
        try {
            const verify = await CryptoUtils.decrypt(storedChallenge, oldKey);
            if (verify !== "VALIDATION_TOKEN") throw new Error("Wrong Old Password");
        } catch (err) {
            document.getElementById('cp-error').innerText = "Incorrect Current Password"; return;
        }

        // 2. Derive New Key
        const newSalt = CryptoUtils.generateSalt();
        const newKey = await CryptoUtils.deriveKey(newPass, newSalt);

        // 3. Re-Encrypt EVERYTHING
        const batch = db.batch();

        // 3a. Re-encrypt Vault
        const vaultSnaps = await db.collection('vault').where('uid', '==', currentUser.uid).get();
        for (let doc of vaultSnaps.docs) {
            const data = doc.data();
            if (data.password && data.iv) {
                // Decrypt with OLD key
                const plain = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, oldKey);
                // Encrypt with NEW key
                const enc = await CryptoUtils.encrypt(plain, newKey);
                batch.update(doc.ref, { password: enc.data, iv: enc.iv }); // Update fields
            }
        }

        // 3b. Re-encrypt History
        const histSnaps = await db.collection('generate_history').where('uid', '==', currentUser.uid).get();
        for (let doc of histSnaps.docs) {
            const data = doc.data();
            if (data.password && data.iv) {
                const plain = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, oldKey);
                const enc = await CryptoUtils.encrypt(plain, newKey);
                batch.update(doc.ref, { password: enc.data, iv: enc.iv });
            }
        }

        // 3c. Update User Profile (Verification Token)
        const newChallenge = await CryptoUtils.encrypt("VALIDATION_TOKEN", newKey);
        batch.update(db.collection('users').doc(currentUser.uid), {
            salt: Array.from(newSalt),
            challenge: newChallenge
        });

        // 4. Commit
        await batch.commit();

        // 5. Update Session -> FORCE LOGOUT
        // sessionKey = newKey; // Old way
        document.getElementById('change-pass-modal').close();
        document.getElementById('change-pass-form').reset();

        alert("Success! Please sign in again with your NEW Master Password.");
        handleLogout(); // Force re-auth to verify

    } catch (err) {
        console.error(err);
        document.getElementById('cp-error').innerText = "Error: " + err.message;
    }
}

// ... (Rest of logic: Setup, Unlock, Vault, etc. - Kept SAME as previous, just overwritten to ensuring consistency) ...
// --- Setup & Reset (Enhanced) ---
async function checkUserEncryptionSetup(user) {
    try {
        const userDocRef = db.collection('users').doc(user.uid);
        const doc = await userDocRef.get();

        if (!doc.exists || !doc.data().salt || !doc.data().challenge) {
            document.getElementById('setup-modal').showModal();
        } else {
            const data = doc.data();
            document.getElementById('unlock-modal').dataset.salt = JSON.stringify(data.salt);
            document.getElementById('unlock-modal').dataset.challenge = JSON.stringify(data.challenge);

            // Handle Iterations Migration (Default to Legacy if missing)
            const iterations = data.iterations || CryptoUtils.CONSTANTS.ITERATIONS_LEGACY;
            document.getElementById('unlock-modal').dataset.iterations = iterations;

            document.getElementById('unlock-modal').showModal();
        }
    } catch (err) {
        console.error("Firestore Access Error:", err);
        showToast("Database Access Denied. Check Rules.", 'error');
    }
}

// Global Reset Function (Hardened)
window.resetAccount = async function () {
    if (!currentUser) return;

    // Strict Confirmation challenge
    const confirmation = prompt("DANGER: This will permanently DELETE your vault.\nTo confirm, strictly type: DELETE");
    if (confirmation !== "DELETE") {
        alert("Reset Cancelled. You must type DELETE (uppercase) to confirm.");
        return;
    }

    try {
        const batch = db.batch();
        batch.delete(db.collection('users').doc(currentUser.uid));

        const vaultSnaps = await db.collection('vault').where('uid', '==', currentUser.uid).get();
        vaultSnaps.forEach(doc => batch.delete(doc.ref));

        const histSnaps = await db.collection('generate_history').where('uid', '==', currentUser.uid).get();
        histSnaps.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        // Clear Local State
        localStorage.clear();
        sessionKey = null;

        alert("Account Reset Complete. Reloading...");
        location.reload();
    } catch (e) {
        alert("Reset Error: " + e.message);
    }
};

async function handleSetupSubmit(e) {
    e.preventDefault();
    const p1 = document.getElementById('setup-pass').value;
    const p2 = document.getElementById('setup-confirm').value;

    if (p1.length < 8) { document.getElementById('setup-error').innerText = "Too short (min 8 chars)."; return; }
    if (p1 !== p2) { document.getElementById('setup-error').innerText = "Passwords do not match."; return; }

    try {
        const salt = CryptoUtils.generateSalt();
        // New users get High Iterations
        const iterations = CryptoUtils.CONSTANTS.ITERATIONS_NEW;

        const key = await CryptoUtils.deriveKey(p1, salt, iterations);
        const challenge = await CryptoUtils.encrypt("VALIDATION_TOKEN", key);

        await db.collection('users').doc(currentUser.uid).set({
            salt: Array.from(salt),
            challenge: challenge,
            iterations: iterations, // Store config!
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        sessionKey = key;
        document.getElementById('setup-modal').close();
        showToast("Encryption Enabled (High Security).");
        startSession();
    } catch (err) {
        console.error(err);
        document.getElementById('setup-error').innerText = "Error: " + err.message;
    }
}

// Rate Limiting Logic
let failedAttempts = 0;
let lockoutUntil = 0;

async function handleUnlockSubmit(e) {
    e.preventDefault();

    // Check Rate Limit
    if (Date.now() < lockoutUntil) {
        const wait = Math.ceil((lockoutUntil - Date.now()) / 1000);
        document.getElementById('unlock-error').innerText = `Too many attempts. Wait ${wait}s.`;
        return;
    }

    const password = document.getElementById('unlock-pass').value;
    const saltArr = JSON.parse(document.getElementById('unlock-modal').dataset.salt || "[]");
    const challengeRaw = document.getElementById('unlock-modal').dataset.challenge;
    const iterations = parseInt(document.getElementById('unlock-modal').dataset.iterations || CryptoUtils.CONSTANTS.ITERATIONS_LEGACY);

    if (saltArr.length === 0 || !challengeRaw) {
        document.getElementById('unlock-error').innerText = "Security Data Corrupt. Please Reset.";
        return;
    }

    try {
        const salt = new Uint8Array(saltArr);
        const key = await CryptoUtils.deriveKey(password, salt, iterations);

        const challengeObj = JSON.parse(challengeRaw);
        try {
            const result = await CryptoUtils.decrypt(challengeObj, key);
            if (result !== "VALIDATION_TOKEN") throw new Error("Invalid Token");
        } catch (decErr) {
            // Handle Failed Attempt
            failedAttempts++;
            if (failedAttempts >= 3) {
                // Exponential Backoff: 5s, 10s, 20s...
                const penalty = 5000 * Math.pow(2, failedAttempts - 3);
                lockoutUntil = Date.now() + penalty;
                document.getElementById('unlock-error').innerText = `Incorrect. Locked for ${penalty / 1000}s.`;
                return;
            }

            document.getElementById('unlock-error').innerText = `Incorrect Password. (${3 - failedAttempts} tries left)`;
            document.getElementById('unlock-pass').value = "";
            document.getElementById('unlock-pass').focus();
            return;
        }

        // Success
        failedAttempts = 0; // Reset counter
        authConfirmSuccess(key);

    } catch (err) {
        console.error(err);
        document.getElementById('unlock-error').innerText = "Error: " + err.message;
    }
}
function authConfirmSuccess(key) { sessionKey = key; document.getElementById('unlock-modal').close(); showToast("Vault Unlocked"); startSession(); }
function startSession() { subscribeToVault(currentUser.uid); subscribeToHistory(currentUser.uid); document.getElementById('history-status').innerText = "Cloud (Encrypted)"; document.getElementById('history-status').classList.add('online'); }
async function subscribeToVault(uid) {
    if (!sessionKey) return;
    vaultUnsubscribe = db.collection("vault").where("uid", "==", uid).onSnapshot(async snap => {
        let tempItems = [];
        for (let doc of snap.docs) {
            const data = doc.data();
            if (data.iv && data.password && Array.isArray(data.password)) {
                try { const plaintext = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, sessionKey); tempItems.push({ id: doc.id, ...data, password: plaintext }); }
                catch (e) { tempItems.push({ id: doc.id, ...data, password: "[DECRYPTION FAILED]" }); }
            } else { tempItems.push({ id: doc.id, ...data }); }
        }
        tempItems.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        vaultItems = tempItems; renderVault(vaultItems);
    }, err => console.error(err));
}
async function saveToHistory(password) {
    if (currentUser) {
        if (!sessionKey) return;
        try { const encrypted = await CryptoUtils.encrypt(password, sessionKey); db.collection("generate_history").add({ uid: currentUser.uid, password: encrypted.data, iv: encrypted.iv, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); }
        catch (e) { console.error("History Encrypt Fail", e); }
    } else {
        const local = getLocalHistory(); local.unshift({ password, timestamp: new Date().toISOString() }); if (local.length > 5) local.pop();
        localStorage.setItem('pw_history', JSON.stringify(local)); renderHistory(local);
    }
}
function subscribeToHistory(uid) {
    if (!sessionKey) return;
    historyUnsubscribe = db.collection("generate_history").where("uid", "==", uid).onSnapshot(async snap => {
        let items = [];
        for (let doc of snap.docs) {
            const data = doc.data();
            if (data.iv && data.password && Array.isArray(data.password)) {
                try { const plaintext = await CryptoUtils.decrypt({ iv: data.iv, data: data.password }, sessionKey); items.push({ ...data, password: plaintext }); }
                catch (e) { items.push({ ...data, password: "🔒 [Encrypted]" }); }
            } else { items.push(data); }
        }
        items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)); renderHistory(items.slice(0, 5));
    });
}
async function handleSaveSubmit(e) {
    e.preventDefault();
    if (!currentUser || !sessionKey) { showToast("Vault locked.", 'error'); return; }
    const name = document.getElementById("modal-site").value;
    const url = document.getElementById("modal-url").value;
    const plainPass = document.getElementById("modal-pass").value;
    try {
        const encrypted = await CryptoUtils.encrypt(plainPass, sessionKey);
        await db.collection("vault").add({ uid: currentUser.uid, name, url, password: encrypted.data, iv: encrypted.iv, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        document.getElementById("save-modal").close(); showToast("Encrypted & Saved!");
    } catch (err) { showToast("Save Failed: " + err.message, 'error'); }
}
// --- Session Security (Auto-Lock & Hygiene) ---
// (Variables declared at top of file)

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (sessionKey && currentUser) {
        inactivityTimer = setTimeout(lockVault, LOCK_TIMEOUT_MS);
    }
}

function lockVault() {
    if (!sessionKey) return;
    console.log("Auto-locking Vault...");
    sessionKey = null; // Wipe Key from Memory

    // UI Cleanup
    vaultItems = [];
    renderVault([]);
    renderHistory([]); // Clear sensitive history from DOM
    document.getElementById('history-status').innerText = "Locked";
    document.getElementById("output").value = ""; // Clear generator output

    if (vaultUnsubscribe) vaultUnsubscribe();
    if (historyUnsubscribe) historyUnsubscribe();

    showToast("Vault Locked (Inactivity)", 'normal');

    // Security: Clear the password field so it can't be reused
    document.getElementById('unlock-pass').value = "";

    checkUserEncryptionSetup(currentUser); // Re-prompt unlock
}

// Global Activity Listeners
['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => document.addEventListener(evt, resetInactivityTimer));

// Lock on Tab Hide (Optional: strict security)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && sessionKey) {
        // Option 1: Lock immediately
        lockVault();
    }
});


function copyToClipboard(text, entityName = "Password") {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${entityName} Copied! Clearing in 30s...`);

        // Robust Clearing Logic
        setTimeout(() => {
            // Browsers force focus for clipboard write
            if (document.hasFocus()) {
                navigator.clipboard.writeText(" ").then(() => {
                    showToast("Clipboard Cleared (Security Check)", 'normal');
                    console.log("Clipboard cleared successfully.");
                }).catch(err => console.warn("Clipboard Clear Blocked (Focus lost?):", err));
            } else {
                console.warn("Clipboard Clear Skipped: Document not focused. (Browser Restriction)");
                // Retry once on next focus? 
                const clearOnFocus = () => {
                    navigator.clipboard.writeText(" ");
                    showToast("Clipboard Cleared", 'normal');
                    document.removeEventListener('focus', clearOnFocus);
                };
                document.addEventListener('focus', clearOnFocus, { once: true });
            }
        }, 30000);

    }).catch(err => showToast("Copy Failed: Permission Denied", 'error'));
}

// ... UI Helpers ...
function syncLength(e) { document.getElementById('len').value = e.target.value; document.getElementById('len-val').innerText = e.target.value; }
function initTheme() { const t = localStorage.getItem('theme') || 'light'; if (t === 'dark') applyTheme('dark'); }
function toggleTheme() { const isDark = document.body.classList.contains('dark-mode'); applyTheme(isDark ? 'light' : 'dark'); localStorage.setItem('theme', isDark ? 'light' : 'dark'); }
function applyTheme(t) { const s = document.getElementById('icon-sun'), m = document.getElementById('icon-moon'); if (t === 'dark') { document.body.classList.add('dark-mode'); s.classList.remove('hidden'); m.classList.add('hidden'); } else { document.body.classList.remove('dark-mode'); s.classList.add('hidden'); m.classList.remove('hidden'); } }
function showToast(msg, type = 'normal') { const c = document.getElementById('toast-container'), t = document.createElement('div'); t.className = `toast ${type}`; t.innerText = msg; c.appendChild(t); requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 3000); }
async function handleLogin() { try { await auth.signInWithPopup(provider); showToast("Signed in"); } catch (e) { showToast("Login failed", 'error'); } }
async function handleLogout() { localStorage.removeItem('pw_history'); if (vaultUnsubscribe) vaultUnsubscribe(); sessionKey = null; await auth.signOut(); window.location.href = "index.html"; }
function updateUIForUser(u) {
    const l = document.getElementById('login-btn'), i = document.getElementById('user-info'), s = document.getElementById('save-btn'), v = document.getElementById('vault-login-msg');
    if (u) { l.classList.add('hidden'); i.classList.remove('hidden'); document.getElementById('user-photo').src = u.photoURL; document.getElementById('user-name').innerText = u.displayName.split(' ')[0]; s.classList.remove('hidden'); v.classList.add('hidden'); }
    else { l.classList.remove('hidden'); i.classList.add('hidden'); s.classList.add('hidden'); v.classList.remove('hidden'); }
}
function handleTabSwitch(id) {
    // Clear potentially sensitive views when switching
    if (id === 'generator') {
        // Maybe don't clear, but ensures we don't leave vault open?
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.target === id));
    document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('hidden', s.id !== `view-${id}`));
}

// REMOVED LEGACY GENERATOR FUNCTIONS

function handleClearHistory() { localStorage.removeItem('pw_history'); renderHistory([]); if (currentUser) { db.collection("generate_history").where("uid", "==", currentUser.uid).get().then(s => { const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); return b.commit(); }).then(() => showToast("History cleared")); } }
function getLocalHistory() { return JSON.parse(localStorage.getItem('pw_history') || '[]'); }
function renderHistory(items) {
    const l = document.getElementById('history-list'); l.innerHTML = "";
    items.forEach(i => {
        const li = document.createElement('li');
        li.className = 'history-item';
        // Masking logic with Toggle
        li.innerHTML = `<span class="masked-pass" title="Click to Copy">••••••••</span> <span class="reveal-btn" style="cursor:pointer; color:var(--primary-color); margin-left:10px;">Show</span>`;

        const span = li.querySelector('.masked-pass');
        const btn = li.querySelector('.reveal-btn');

        // Toggle Visibility on Click
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (span.innerText === "••••••••") {
                span.innerText = i.password;
                btn.innerText = "Hide";
            } else {
                span.innerText = "••••••••";
                btn.innerText = "Show";
            }
        });

        // Copy when clicking the password text (hidden or shown)
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(i.password, "Password");
        });

        l.appendChild(li);
    });
}
function handleSaveClick() { const p = document.getElementById("output").value; if (!p) { showToast("Generate first!", 'error'); return; } if (currentUser && !sessionKey) { showToast("Unlock Vault first", 'error'); checkUserEncryptionSetup(currentUser); return; } document.getElementById("modal-pass").value = p; document.getElementById("modal-site").value = ""; document.getElementById("modal-url").value = ""; document.getElementById("save-modal").showModal(); }
function promptDelete(id) { itemToDelete = id; document.getElementById('confirm-modal').showModal(); }
function executeDelete() { if (!itemToDelete) return; db.collection("vault").doc(itemToDelete).delete().then(() => { document.getElementById('confirm-modal').close(); showToast("Deleted"); }).catch(e => showToast("Error: " + e.message, 'error')); }
function handleVaultSearch(e) { const t = e.target.value.toLowerCase(); renderVault(vaultItems.filter(i => (i.name && i.name.toLowerCase().includes(t)) || (i.url && i.url.toLowerCase().includes(t)))); }
function renderVault(items) {
    const l = document.getElementById('vault-list'); l.innerHTML = ""; if (items.length === 0) { l.innerHTML = `<div class="empty-state">No passwords found.</div>`; return; }
    items.forEach(i => {
        // No Favicons (Privacy) - strict
        const div = document.createElement('div'); div.className = 'vault-item';
        div.innerHTML = `
            <div class="vault-icon"><div class="placeholder">${(i.name || "?")[0].toUpperCase()}</div></div>
            <div class="vault-info"><div class="vault-name">${i.name}</div><div class="vault-url">${i.url || 'No URL'}</div></div>
            <div class="vault-actions">
                <button class="vault-btn copy-btn" title="Copy"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                <button class="vault-btn delete" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>`;
        div.querySelector('.copy-btn').addEventListener('click', () => copyToClipboard(i.password, i.name));
        div.querySelector('.delete').addEventListener('click', () => promptDelete(i.id));
        l.appendChild(div);
    });
}