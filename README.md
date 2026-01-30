# Enkryptr - Secure Password Manager

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" alt="Status">
  <img src="https://img.shields.io/badge/Security-Zero--Knowledge-blue?style=flat-square" alt="Security">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
</div>

## 🔒 About Enkryptr

Enkryptr is a modern, privacy-focused password manager designed to explore secure client-side application design in the browser. It uses client-side encryption to ensure that sensitive data is encrypted on your device *before* being stored locally or synced to the cloud.

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

### ⚡ Offline / Local Mode
Guest mode works entirely offline, storing encrypted data locally without any account or cloud sync.

### 🌓 Dark / Light Mode
Responsive UI with system theme detection and manual override.

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
*   **Guest Mode**: Encrypted data is stored locally in the browser.
*   **Signed-In Mode**: Encrypted JSON blobs are synced to Firestore. The backend never sees plaintext.

### Access Control
Firestore security rules enforce strict per-user ownership; even with valid API keys, cross-user access is denied.

## ⚠️ Security Notes & Limitations

This project assumes a trusted browser environment. As with all browser-based security models, it does not protect against:
*   Malicious browser extensions
*   XSS vulnerabilities introduced by third-party scripts
*   Compromised devices

*This project is intended for educational and personal use, not as a production password manager.*

## 👤 Author

**Navaneeth Mohan**
