document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const pathInput = document.getElementById('pathInput');
    const contentArea = document.getElementById('contentArea');
    const saveBtn = document.getElementById('saveBtn');
    const notifyBtn = document.getElementById('notifyBtn');
    const enableNotifyBtn = document.getElementById('enableNotifyBtn');
    const lockBtn = document.getElementById('lockBtn');
    const statusMsg = document.getElementById('statusMsg');
    const charCount = document.getElementById('charCount');
    const toastContainer = document.getElementById('toastContainer');
    // Auth UI
    const lockOverlay = document.getElementById('lockOverlay');
    const unlockBtn = document.getElementById('unlockBtn');
    const passModal = document.getElementById('passModal');
    const modalInput = document.getElementById('modalInput');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');

    // State
    let currentPath = '';
    let currentPassword = '';
    let isLocked = false;
    let modalAction = null;
    let isDirty = false;
    let autoSaveTimer = null;
    let pollTimer = null;
    let eventSource = null;

    // Check Notification Permission on Load
    checkNotificationPermission();

    // Initialize
    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path');
    if (initialPath) {
        pathInput.value = initialPath;
        loadContent(initialPath);
    }

    // --- Helper for Permissions ---
    function checkNotificationPermission() {
        if (!("Notification" in window)) return;

        if (Notification.permission === 'default') {
            enableNotifyBtn.style.display = 'flex';
            enableNotifyBtn.title = 'Enable Desktop Notifications';
        } else if (Notification.permission === 'denied') {
            enableNotifyBtn.style.display = 'flex';
            enableNotifyBtn.style.opacity = '0.5';
            enableNotifyBtn.title = 'Notifications Blocked via Browser Settings';
            enableNotifyBtn.disabled = true;
        } else {
            enableNotifyBtn.style.display = 'none';
        }
    }

    // --- Event Listeners ---

    // Enable Notify Button
    enableNotifyBtn.addEventListener('click', () => {
        Notification.requestPermission().then(permission => {
            checkNotificationPermission();
            if (permission === 'granted') {
                showToast('Notifications Enabled', 'You will now receive desktop alerts.', 'success');
            } else if (permission === 'denied') {
                showToast('Blocked', 'You denied notification permissions.', 'error');
            }
        });
    });

    // Path Input
    pathInput.addEventListener('input', (e) => {
        validatePath(e.target.value.trim());
    });

    pathInput.addEventListener('blur', () => {
        const path = pathInput.value.trim();
        if (path && path !== currentPath) {
            loadContent(path);
        }
    });

    pathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const path = pathInput.value.trim();
            if (path && path !== currentPath) {
                loadContent(path);
            }
        }
    });

    // Content Input (Auto-save)
    contentArea.addEventListener('input', () => {
        isDirty = true;
        updateStats();
        statusMsg.textContent = 'Saving...';
        statusMsg.className = 'status-msg';

        // Debounce save
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            saveContent();
        }, 1000);
    });

    // Buttons
    saveBtn.addEventListener('click', () => {
        clearTimeout(autoSaveTimer);
        saveContent();
    });
    lockBtn.addEventListener('click', openSetLockModal);

    notifyBtn.addEventListener('click', async () => {
        // Request permission on click if not granted
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }

        if (!currentPath) return;
        notifyBtn.disabled = true;
        try {
            const response = await fetch(`/api/panchuko/${encodeURIComponent(currentPath)}/notify`, {
                method: 'POST'
            });
            if (response.ok) {
                // showToast('Notification sent', 'Other users have been notified.', 'success');
            } else {
                showToast('Failed to send', 'Could not send notification.', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Error', 'Connection error.', 'error');
        } finally {
            setTimeout(() => {
                if (currentPath && !isLocked) notifyBtn.disabled = false;
            }, 1000);
        }
    });

    // Auth UI
    unlockBtn.addEventListener('click', openUnlockModal);

    // Modal
    modalCancel.addEventListener('click', closeModal);
    modalConfirm.addEventListener('click', handleModalConfirm);
    modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleModalConfirm();
        if (e.key === 'Escape') closeModal();
    });
    passModal.addEventListener('click', (e) => {
        if (e.target === passModal) closeModal();
    });

    // Request permission on first interaction with the document if possible, or leave it to specific buttons
    document.addEventListener('click', () => {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            // Force save
            clearTimeout(autoSaveTimer);
            saveContent();
        }
    });

    // --- Functions ---

    function setupSSE(path) {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        if (!path) return;

        eventSource = new EventSource(`/api/panchuko/${encodeURIComponent(path)}/events`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'notification') {
                sendNativeNotification('Update Available', 'Another user has updated this content.');
                // Optional: Keep toast as backup or visual feedback
                showToast('Update Available', 'Another user has updated this content.', 'info');
            }
        };

        eventSource.onerror = (e) => {
            // console.error('SSE Error', e);
            // EventSource auto-reconnects, but if it fails permanently we might want to fallback or warn
        };
    }

    function sendNativeNotification(title, body) {
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            new Notification(title, { body: body, icon: '/devtools_logo.png' });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, { body: body, icon: '/devtools_logo.png' });
                }
            });
        }
    }

    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';

        // Icons
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        } else { // info
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }

        toast.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
        `;

        toastContainer.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('out');
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 5000);
    }

    function validatePath(path) {
        if (!path) {
            saveBtn.disabled = true;
            notifyBtn.disabled = true;
            lockBtn.disabled = true;
            statusMsg.textContent = 'Enter a path to start';
            return false;
        }
        if (!/^[\w\-. @]+$/.test(path)) {
            statusMsg.textContent = 'Invalid characters (use letters, numbers, - _ . @ space)';
            statusMsg.className = 'status-msg error';
            saveBtn.disabled = true;
            notifyBtn.disabled = true;
            lockBtn.disabled = true;
            return false;
        }

        saveBtn.disabled = false;
        notifyBtn.disabled = false;
        lockBtn.disabled = false;
        // Don't overwrite status if saving
        if (!statusMsg.textContent.includes('Saving')) {
            statusMsg.textContent = 'Ready';
            statusMsg.className = 'status-msg';
        }
        return true;
    }

    async function loadContent(path, isPoll = false) {
        if (!validatePath(path)) return;

        // Don't show "Loading..." if polling to avoid flicker
        if (!isPoll) {
            statusMsg.textContent = 'Loading...';
            // Only reset password if moving to a new path
            if (path !== currentPath) {
                currentPassword = '';
                isLocked = false;
            }
            // UI Reset
            lockOverlay.style.display = 'none';
            lockBtn.classList.remove('active');

            // Setup SSE for new path
            setupSSE(path);
        } else {
            // If polling and user has unsaved changes, skip
            if (isDirty) return;
        }

        currentPath = path;
        updateURL(path);

        try {
            const response = await fetch(`/api/panchuko/${encodeURIComponent(path)}`, {
                headers: { 'x-password': encodeURIComponent(currentPassword) }
            });

            if (response.status === 401) {
                // Locked
                if (!isPoll) { // Only block UI if not polling (prevent getting locked out while reading if someone adds lock?)
                    // Actually if polling reveals a lock, we SHOULD lock the UI.
                    isLocked = true;
                    contentArea.value = '';
                    lockOverlay.style.display = 'flex';
                    statusMsg.textContent = 'Locked path';
                    lockBtn.classList.add('active');
                }
                return;
            }

            const data = await response.json();

            if (response.ok) {
                // If polling, only update if content changed
                const newContent = data.content || '';
                const newLocked = data.locked;

                if (isPoll && newContent === contentArea.value && newLocked === isLocked) {
                    return; // No changes
                }

                if (!isPoll || (!isDirty && newContent !== contentArea.value)) {
                    contentArea.value = newContent;
                }

                isLocked = newLocked;
                if (isLocked) lockBtn.classList.add('active');
                else lockBtn.classList.remove('active');

                if (!isPoll) {
                    statusMsg.textContent = 'Loaded';
                    if (!newContent && !newLocked) statusMsg.textContent = 'New file';
                }
                updateStats();
            } else if (response.status === 404) {
                if (!isPoll) {
                    contentArea.value = '';
                    statusMsg.textContent = 'New file';
                }
            }
        } catch (error) {
            // contentArea.value = 'Connection error' // Don't wipe content on error
            if (!isPoll) {
                console.error('Load error:', error);
                statusMsg.textContent = 'Connection error';
                statusMsg.className = 'status-msg error';
            }
        }
    }

    async function saveContent() {
        const path = pathInput.value.trim();
        const content = contentArea.value;

        if (!validatePath(path)) return;

        // statusMsg.textContent = 'Saving...'; // Already set by input event

        try {
            const body = {
                content: content,
                password: currentPassword
            };

            const response = await fetch(`/api/panchuko/${encodeURIComponent(path)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // const data = await response.json(); // Don't need data unless error

            if (response.ok) {
                isDirty = false;
                statusMsg.textContent = 'Saved';
                statusMsg.className = 'status-msg success';
                // Don't clear "Saved" message too quickly so user sees it
            } else if (response.status === 401) {
                statusMsg.textContent = 'Updates rejected: Locked (check password)';
                statusMsg.className = 'status-msg error';
                openUnlockModal();
            } else {
                statusMsg.textContent = 'Save failed';
                statusMsg.className = 'status-msg error';
            }
        } catch (error) {
            console.error('Save error:', error);
            statusMsg.textContent = 'Connection error';
            statusMsg.className = 'status-msg error';
        }
    }

    async function setLock(newPassword) {
        // If we are setting a lock, we need to send current password (if it was already locked & we unlocked it) + new password
        const path = currentPath;
        statusMsg.textContent = 'Updating security...';

        try {
            const body = {
                password: currentPassword, // Auth for existing lock
                newPassword: newPassword   // New lock (or empty to unlock)
            };

            const response = await fetch(`/api/panchuko/${encodeURIComponent(path)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (response.ok) {
                statusMsg.textContent = newPassword ? 'Password Set!' : 'Unlocked!';
                statusMsg.className = 'status-msg success';

                isLocked = !!newPassword;
                if (isLocked) {
                    lockBtn.classList.add('active');
                    currentPassword = newPassword; // retain access
                } else {
                    lockBtn.classList.remove('active');
                    currentPassword = '';
                }

                setTimeout(() => {
                    statusMsg.textContent = 'Ready';
                    statusMsg.className = 'status-msg';
                }, 2000);
            } else if (response.status === 401) {
                statusMsg.textContent = 'Access Denied';
                statusMsg.className = 'status-msg error';
            } else {
                statusMsg.textContent = 'Failed to update lock';
                statusMsg.className = 'status-msg error';
            }
        } catch (e) {
            console.error(e);
            statusMsg.textContent = 'Error';
        }
    }

    // --- Modal Logic ---

    function openUnlockModal() {
        modalAction = 'unlock';
        modalTitle.textContent = 'Unlock File';
        modalDesc.textContent = 'Enter the password to access this file.';
        modalInput.placeholder = 'Password';
        modalInput.value = '';
        passModal.style.display = 'flex';
        modalInput.focus();
    }

    function openSetLockModal() {
        modalAction = 'set-lock';
        modalTitle.textContent = isLocked ? 'Change Password' : 'Set Password';
        modalDesc.textContent = isLocked
            ? 'Enter a new password. Leave empty to remove protection.'
            : 'Enter a password to protect this file.';
        modalInput.placeholder = 'New Password';
        modalInput.value = ''; // Don't show current password
        passModal.style.display = 'flex';
        modalInput.focus();
    }

    function closeModal() {
        passModal.style.display = 'none';
        modalInput.value = '';
    }

    function handleModalConfirm() {
        const inputVal = modalInput.value.trim();
        closeModal();

        if (modalAction === 'unlock') {
            // Try to load with this password
            currentPassword = inputVal;
            // Retry loading
            loadContent(currentPath);
        } else if (modalAction === 'set-lock') {
            setLock(inputVal);
        }
    }

    function updateURL(path) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('path', path);
        window.history.pushState({}, '', newUrl);
    }

    function updateStats() {
        const charLen = contentArea.value.length;
        charCount.textContent = `${charLen} character${charLen !== 1 ? 's' : ''}`;
    }
});
