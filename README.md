# Enkryptr - Secure Password Manager

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" alt="Status">
  <img src="https://img.shields.io/badge/Security-Zero--Knowledge-blue?style=flat-square" alt="Security">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
</div>

## 🔒 About Enkryptr

Enkryptr is a modern, privacy-focused password manager designed to explore secure client-side application design in the browser. Its signed-in vault uses client-side encryption before passwords are synced to the cloud. Guest mode generates passwords locally but stores recent history unencrypted in the browser.

Enkryptr follows a **zero-knowledge, client-side security model**: encrypted data may be stored or synced via cloud services, but encryption keys are derived locally and **never transmitted**.

## Key Features

### 🛡️ Strong Client-Side Encryption
Uses **AES-256-GCM** encryption with keys derived from a Master Password using **PBKDF2** (SHA-256). New vaults use a high iteration count, with legacy compatibility for earlier configurations.

### 🔑 Zero-Knowledge (Client-Side)
Your Master Password and unencrypted data **never leave your device**. The backend stores only encrypted blobs.

### 🎲 Secure Password Generator
Generates cryptographically strong passwords using the **Web Crypto API** with configurable length and character sets.

### ☁️ Optional Encrypted Cloud Sync
Sign in with Google to sync your encrypted vault across devices using **Firebase**. The server never has access to plaintext data.

### ⚡ Guest Generator
Generate passwords without an account or cloud sync. The last five generated passwords are stored **unencrypted** in local browser storage. The current app still loads Firebase SDKs from the network; fully offline startup is not implemented.

### 🌓 Dark / Light Mode
Responsive UI with a persistent manual theme override.

### 📱 Fully Responsive
Optimized for desktop and mobile browsers.

## 🚀 Tech Stack

*   **Frontend**: HTML5, CSS3, JavaScript (ES6+)
*   **Cryptography**: Web Crypto API (SubtleCrypto)
*   **Authentication**: Firebase Authentication (Google Sign-In)
*   **Database**: Cloud Firestore (stores only encrypted payloads)

## 🧠 Security Architecture (High-Level)

### Key Derivation
The Master Password is combined with a per-user salt and processed using **PBKDF2 (SHA-256)** to derive an encryption key.
*   New vaults use higher iteration counts.
*   Older vaults are supported for compatibility.

### Encryption
Vault entries are encrypted using **AES-GCM** with a unique initialization vector (IV) per entry.

### Storage
*   **Guest Mode**: Recent generated passwords are stored unencrypted in the browser. Guest mode does not provide an encrypted vault.
*   **Signed-In Mode**: Encrypted JSON blobs are synced to Firestore. The backend never sees plaintext.

### Access Control
Firestore security rules enforce strict per-user ownership; even with valid API keys, cross-user access is denied.

## ⚠️ Security Notes & Limitations

This project assumes a trusted browser environment. As with all browser-based security models, it does not protect against:
*   Malicious browser extensions
*   XSS vulnerabilities introduced by third-party scripts
*   Compromised devices

*This project is intended for educational and personal use, not as a production password manager.*

## Local development

Serve the project over HTTP (Web Crypto and clipboard features require localhost or HTTPS):

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765` for the welcome page or `/app.html` for the generator.

### Redesign checks

```sh
node --test tests/*.test.cjs
npm install --prefix /tmp/enkryptr-qa playwright
PLAYWRIGHT_MODULE=/tmp/enkryptr-qa/node_modules/playwright node tests/browser.cjs
PLAYWRIGHT_MODULE=/tmp/enkryptr-qa/node_modules/playwright node tests/landing-browser.cjs
PLAYWRIGHT_MODULE=/tmp/enkryptr-qa/node_modules/playwright node tests/mobile-accessibility.cjs
```

The browser checks use Chromium at `/usr/bin/chromium` (override with `CHROMIUM_PATH`). They exercise guest generation, character options, length, clipboard, history, vault navigation, theme persistence, dialog cancellation, reduced motion, and responsive layouts. Screenshots go to `/tmp/enkryptr-qa/screenshots` (override with `SCREENSHOT_DIR`). No real account sign-in or cloud vault writes are performed.

The landing-page checks also exercise the live, non-persistent password sample, spring-driven reveals, reduced motion, and text/layout clipping. Landing screenshots go to `/tmp/enkryptr-qa/v2`. The original silver key was rendered locally with Three.js; its editable scene is preserved in `assets/source/key-studio.html`. Production pages load the rendered PNG, not Three.js or a WebGL runtime.

**Implementation note:** Guest mode currently provides generation and keeps the last five passwords **unencrypted** in local browser storage. The encrypted vault requires sign-in. The interface makes this distinction explicit; encrypted offline guest-vault storage described elsewhere in this README is not currently implemented.

## 👤 Author

**Navaneeth Mohan**
