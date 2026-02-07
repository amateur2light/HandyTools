# Deployment Guide

This guide explains how to deploy your **HandyTools** static site to the internet for free using popular hosting providers.

## Option 1: Netlify Drop (Easiest)
**Best for:** Quick, drag-and-drop deployment without using Git commands.

1.  Go to [Netlify Drop](https://app.netlify.com/drop).
2.  Open your file explorer to the folder containing your project (`d:\Drives\Amateur_2light\Random\AntiGravity\HandyTools`).
3.  **Drag and drop** the entire `HandyTools` folder into the Netlify browser window.
4.  Netlify will upload and deploy your site instantly.
5.  You will get a random URL (e.g., `silly-williams-12345.netlify.app`), which you can change in "Site Settings".

## Option 2: Vercel (Recommended for Updates)
**Best for:** Professional hosting with automatic updates if you use GitHub later.

### Method A: Vercel CLI (Command Line)
1.  Open your terminal in the project folder.
2.  Install Vercel CLI:
    ```bash
    npm i -g vercel
    ```
3.  Run the deploy command:
    ```bash
    vercel
    ```
4.  Follow the prompts (hit Enter to accept defaults).
5.  Your site will be live at the URL provided in the terminal.

## Option 3: GitHub Pages
**Best for:** If you already push your code to GitHub.

1.  Create a repository on GitHub.
2.  Push your code to the repository.
3.  Go to **Settings** > **Pages**.
4.  Under **Source**, select `Deploy from a branch`.
5.  Select `main` (or `master`) branch and `/root` folder.
6.  Click **Save**. Your site will be available at `https://<username>.github.io/<repo-name>`.

---

## Local Network Access
To share with devices on your same WiFi (like your phone):
1.  Double-click `run_server.bat` in your project folder.
2.  Access `http://<YOUR_IP>:8080` on your phone's browser.
    *   *Note: Your IP is displayed in the terminal window when the server starts.*
