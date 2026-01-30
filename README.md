# Enkryptr - Secure Password Manager

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" alt="Status">
  <img src="https://img.shields.io/badge/Security-Zero--Knowledge-blue?style=flat-square" alt="Security">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
</div>

<p align="center">
  <strong>Generate strong passwords, encrypt them locally, and sync securely across devices.</strong>
</p>

## 🔒 About Enkryptr

Enkryptr is a modern, secure, and user-friendly password manager that prioritizes your privacy. Built with a **Zero-Knowledge Architecture**, Enkryptr ensures that your passwords are encrypted explicitly on your device *before* they ever touch the cloud. We (and Google) enable storage, but **only YOU hold the keys**.

### Key Features

*   **🛡️ Military-Grade Encryption**: Uses **AES-256-GCM** encryption derived from your Master Password using **PBKDF2** (100,000 iterations).
*   **🔑 Zero-Knowledge Security**: Your Master Password and unencrypted data never leave your device.
*   **🎲 robust Password Generator**: Create cryptographically strong passwords with customizable length and characters (uppercase, lowercase, numbers, symbols).
*   **☁️ Secure Cloud Sync**: Optional sign-in (via Google) to sync your encrypted vault across devices using Firebase.
*   **🌓 Dark/Light Mode**: sleek, responsive UI with automatic theme detection and manual toggle.
*   **📱 Fully Responsive**: Works seamlessly on desktops, tablets, and mobile devices.
*   **⚡ Offline Capable**: Works purely locally if you choose the "Guest" mode.

## 🚀 Tech Stack

*   **Frontend**: HTML5, CSS3 (Custom Properties & Animations), JavaScript (ES6+)
*   **Encryption**: Web Crypto API (SubtleCrypto)
*   **Backend / Auth**: Firebase Authentication, Google Sign-In
*   **Database**: Cloud Firestore (Stores *only* encrypted blobs)

## 🛠️ Getting Started

### Prerequisites

*   A modern web browser (Chrome, Firefox, Edge, Safari) that supports the Web Crypto API.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/NavaneethMohan/enkryptr.git
    cd enkryptr
    ```

2.  **Run Locally**:
    *   Simply open `index.html` in your browser.
    *   *(Recommmended)* Use a local server like Live Server for VS Code or Python:
        ```bash
        # Python 3
        python -m http.server 8000
        ```

### Configuration (For Developers)

To enable Cloud Sync features in your own fork, you'll need to set up a Firebase project:

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Create a new project.
3.  Enable **Authentication** (Google Sign-In).
4.  Enable **Cloud Firestore**.
5.  Copy your web app configuration.
6.  Update the `firebaseConfig` object in `firebase_config.js` and `index.html`:

    ```javascript
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.appspot.com",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    ```

## 📖 Usage Guide

1.  **Generate**: Use the slider and checkboxes to generate a strong password. Click to copy.
2.  **Setup Vault**: Click "Save to Vault" or "My Vault". You'll be prompted to create a **Master Password**.
    *   *Warning*: Remember this password! There is no "Forgot Password" reset that can recover your data.
3.  **Sync**: Sign in with Google on the landing page (`index.html`) or app header to enable cloud sync.
4.  **Manage**: View your saved passwords in the "My Vault" tab. You can copy usernames/passwords or delete entries.

## 🧠 Security Architecture

1.  **Key Derivation**: Your Master Password is salted and hashed using **PBKDF2** with SHA-256 to create a cryptographic key.
2.  **Encryption**: Data is encrypted using **AES-GCM** (Galois/Counter Mode) with a unique Initialization Vector (IV) for each entry.
3.  **Storage**:
    *   **Local**: Encrypted data is stored in `localStorage`.
    *   **Cloud**: Encrypted JSON blobs are sent to Firestore. The server never sees the plaintext.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 👤 Author

**Navaneeth Mohan**

---

*Note: This project is for educational and personal use. While standard industry encryption is used, always exercise caution with sensitive data.*
