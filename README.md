# HandyTools 🛠️

![HandyTools Logo](handytools_logo.png)

> A suite of powerful, client-side utilities for your daily handy tasks. Run it locally, use it instantly.

![GitHub last commit](https://img.shields.io/github/last-commit/amateur2light/HandyTools?color=6366f1&style=for-the-badge)
![License](https://img.shields.io/badge/license-ISC-green?style=for-the-badge)

## ✨ Features

HandyTools provides a collection of focused utilities in a single, lightweight server:

### 🔍 **DocuSearch**
Search specifically for keywords across multiple files instantly. Perfect for logs, codebases, or documentation.
- Supports `.txt`, `.md`, `.js`, `.json`, `.log`, and `.docx`.
- Drag and drop functionality.

### 🔢 **Duplicate Counter**
Clean up your data by finding and counting duplicate lines.
- Paste text or upload files.
- Remove duplicates and export clean lists.

### 📝 **Text Editor**
A distraction-free, Sublime-like text editor for your snippets.
- **Smart Regex**: Auto-detect patterns.
- **Persistent**: Saves your work locally.
- **Diff View**: Compare text easily.

### 📡 **Panchuko Share**
Share and persist text content on specific paths instantly across your local network.
- Real-time updates.
- Password protection for shared paths.

---

## 🚀 Getting Started

You can run HandyTools locally on your machine.

### Prerequisites
- Node.js installed

### Installation

```bash
# Clone the repository
git clone https://github.com/amateur2light/HandyTools.git

# Navigate to the directory
cd HandyTools

# Install dependencies (only for self-signed certs if needed, otherwise optional)
npm install
```

### Running the Server

**Windows:**
Simply double-click `run_server.bat` or run:
```cmd
run_server.bat
```

**Manual:**
```bash
node server.js
```

The server will start at:
- **Local:** `http://localhost:8080`
- **Network:** `http://<YOUR_LAN_IP>:8080`

---

## 🌐 Deployment

Want to host this on the web? Check out our [Deployment Guide](DEPLOY.md) for instructions on using Netlify, Vercel, or GitHub Pages.

---

## 📄 License

This project is licensed under the ISC License.
