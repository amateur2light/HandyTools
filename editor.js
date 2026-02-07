document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('code-editor');
    const overlay = document.getElementById('code-overlay');
    const lineNumbers = document.getElementById('line-numbers');
    const cursorPosDisplay = document.getElementById('cursor-pos');
    const charCountDisplay = document.getElementById('char-count');
    const panel = document.getElementById('find-replace-panel');

    // Find/Replace Elements
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const toggleCaseBtn = document.getElementById('toggle-case');
    const toggleRegexBtn = document.getElementById('toggle-regex');
    const findNextBtn = document.getElementById('find-next-btn');
    const findAllBtn = document.getElementById('find-all-btn'); // Currently just highlights
    const replaceBtn = document.getElementById('replace-btn');
    const replaceAllBtn = document.getElementById('replace-all-btn');
    const toggleFindBtn = document.getElementById('toggle-find-btn');

    // State
    let isCaseSensitive = false;
    let isRegex = false;
    let searchMatches = [];
    let currentMatchIndex = -1;

    // --- History / Undo-Redo System ---
    const history = {
        stack: [],
        currentIndex: -1,
        maxSize: 50,

        save(text, cursor) {
            // Remove any future states if we are in the middle of the stack
            if (this.currentIndex < this.stack.length - 1) {
                this.stack = this.stack.slice(0, this.currentIndex + 1);
            }

            // Don't save if identical to current state (debounce helper)
            const current = this.stack[this.currentIndex];
            if (current && current.text === text) return;

            this.stack.push({ text, cursor });
            if (this.stack.length > this.maxSize) {
                this.stack.shift();
            } else {
                this.currentIndex++;
            }
            this.updateUI();
        },

        undo() {
            if (this.currentIndex > 0) {
                this.currentIndex--;
                return this.stack[this.currentIndex];
            }
            return null;
        },

        redo() {
            if (this.currentIndex < this.stack.length - 1) {
                this.currentIndex++;
                return this.stack[this.currentIndex];
            }
            return null;
        },

        updateUI() {
            const undoBtn = document.getElementById('undo-btn');
            const redoBtn = document.getElementById('redo-btn');
            if (undoBtn) undoBtn.style.opacity = this.currentIndex > 0 ? '1' : '0.5';
            if (redoBtn) redoBtn.style.opacity = this.currentIndex < this.stack.length - 1 ? '1' : '0.5';
        }
    };

    // Debounce for typing
    let typingTimer;
    const saveState = () => {
        history.save(editor.value, editor.selectionStart);
    };

    // Initialize history
    saveState();

    // --- Core Editor Logic ---

    const updateLineNumbers = () => {
        const lines = editor.value.split('\n').length;
        lineNumbers.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
    };

    const updateStatusBar = () => {
        const text = editor.value;
        const cursorPosition = editor.selectionStart;

        const linesToCursor = text.substring(0, cursorPosition).split('\n');
        const currentLine = linesToCursor.length;
        const currentCol = linesToCursor[linesToCursor.length - 1].length + 1;

        cursorPosDisplay.textContent = `Ln ${currentLine}, Col ${currentCol}`;
        charCountDisplay.textContent = `${text.length} chars`;
    };

    const syncScroll = () => {
        lineNumbers.scrollTop = editor.scrollTop;
        overlay.scrollTop = editor.scrollTop;
        overlay.scrollLeft = editor.scrollLeft;
    };

    // --- Find & Replace Logic ---

    const escapeHtml = (text) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const getRegex = () => {
        const query = findInput.value;
        if (!query) return null;

        try {
            const flags = isCaseSensitive ? 'g' : 'gi';
            return isRegex
                ? new RegExp(query, flags)
                : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        } catch (e) {
            return null; // Invalid regex
        }
    };

    const updateOverlay = () => {
        const text = editor.value;
        const regex = getRegex();

        if (!regex || findInput.value === '') {
            overlay.innerHTML = escapeHtml(text) + '<br>'; // mimic textarea newline behavior
            searchMatches = [];
            return;
        }

        let match;
        searchMatches = [];
        let lastIndex = 0;
        let html = '';

        // Reset regex lastIndex if global
        regex.lastIndex = 0;

        // Manual loop to capture indices for navigation
        while ((match = regex.exec(text)) !== null) {
            searchMatches.push({ start: match.index, end: match.index + match[0].length });

            html += escapeHtml(text.substring(lastIndex, match.index));
            html += `<mark>${escapeHtml(match[0])}</mark>`;
            lastIndex = regex.lastIndex;

            if (!regex.global) break; // Infinite loop safety for non-global (should be global though)
            if (match.index === regex.lastIndex) regex.lastIndex++; // Zero-width match safety
        }

        html += escapeHtml(text.substring(lastIndex));
        overlay.innerHTML = html + '<br>';
    };

    const findNext = () => {
        if (searchMatches.length === 0) {
            updateOverlay(); // Refresh matches
            if (searchMatches.length === 0) return;
        }

        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        const match = searchMatches[currentMatchIndex];

        editor.focus();
        editor.setSelectionRange(match.start, match.end);

        // Scroll into view logic (basic)
        const blurHeight = editor.clientHeight / 2;
        // This is tricky with raw textarea, relying on browser's auto-scroll on selection change usually sufficient
    };

    const replaceCurrent = () => {
        if (editor.selectionStart === editor.selectionEnd) return; // No selection

        // Verify selection matches find input (basic check)
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        /* 
           This is soft check. A better way is: replace needs to find the *next* match 
           from cursor, replace it, then move to next. 
           Standard behavior: Replace currently selected text if it matches, else Find Next.
        */

        // For simplicity: Replace currently selected range
        const replacement = replaceInput.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        editor.setSelectionRange(start, end);
        document.execCommand('insertText', false, replacement); // Preserves undo stack

        updateOverlay();
        findNext(); // Move to next
    };

    const replaceAll = () => {
        const regex = getRegex();
        if (!regex) return;

        const text = editor.value;
        const replacement = replaceInput.value;
        const newText = text.replace(regex, replacement);

        if (text !== newText) {
            editor.value = newText;
            updateOverlay();
            updateLineNumbers();
            updateStatusBar();
        }
    };

    const copyAllMatches = async () => {
        const regex = getRegex();
        if (!regex) return;

        const text = editor.value;
        const matches = text.match(regex);

        if (matches && matches.length > 0) {
            try {
                await navigator.clipboard.writeText(matches.join('\n'));
                // Temporary feedback (optional, could be a toast)
                const originalText = document.getElementById('copy-matches-btn').innerHTML;
                document.getElementById('copy-matches-btn').innerHTML = '✓';
                setTimeout(() => document.getElementById('copy-matches-btn').innerHTML = originalText, 1000);
            } catch (err) {
                console.error('Failed to copy matches:', err);
            }
        }
    };

    const cutAllMatches = async () => {
        const regex = getRegex();
        if (!regex) return;

        const text = editor.value;
        const matches = text.match(regex);

        if (matches && matches.length > 0) {
            try {
                await navigator.clipboard.writeText(matches.join('\n')); // Copy first

                // Then remove (replace with empty string)
                const newText = text.replace(regex, '');
                editor.value = newText;

                updateOverlay();
                updateLineNumbers();
                updateStatusBar();

                const originalText = document.getElementById('cut-matches-btn').innerHTML;
                document.getElementById('cut-matches-btn').innerHTML = '✓';
                setTimeout(() => document.getElementById('cut-matches-btn').innerHTML = originalText, 1000);
            } catch (err) {
                console.error('Failed to cut matches:', err);
            }
        }
    };

    const generateSmartRegex = () => {
        const text = editor.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        if (start === end) return; // No selection

        const selection = text.substring(start, end);
        let regexPattern = '';

        // 1. Detect Integers
        if (/^\d+$/.test(selection)) {
            regexPattern = '\\d+';
        }
        // 2. Detect Floats
        else if (/^\d+\.\d+$/.test(selection)) {
            regexPattern = '\\d+\\.\\d+';
        }
        // 3. Detect IPv4 Addresses (192.168.1.1)
        else if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(selection)) {
            regexPattern = '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
        }
        // 4. Detect Dates (ISO YYYY-MM-DD, Common DD/MM/YYYY, MM-DD-YYYY)
        else if (/^\d{4}-\d{2}-\d{2}$/.test(selection)) {
            regexPattern = '\\d{4}-\\d{2}-\\d{2}';
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(selection)) {
            regexPattern = '\\d{2}\\/\\d{2}\\/\\d{4}';
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(selection)) {
            regexPattern = '\\d{2}-\\d{2}-\\d{4}';
        }
        // 5. Detect Time (HH:MM, HH:MM:SS)
        else if (/^\d{2}:\d{2}$/.test(selection)) {
            regexPattern = '\\d{2}:\\d{2}';
        } else if (/^\d{2}:\d{2}:\d{2}$/.test(selection)) {
            regexPattern = '\\d{2}:\\d{2}:\\d{2}';
        }
        // 6. Detect Phone Numbers (Basic international/US format)
        else if (/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(selection)) {
            regexPattern = '[\\+]?[(]?[0-9]{3}[)]?[-\\s\\.]?[0-9]{3}[-\\s\\.]?[0-9]{4,6}';
        }
        // 7. Detect Emails
        else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selection)) {
            regexPattern = '[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}';
        }
        // 8. Detect Sub-domains / URLs
        else if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(selection)) {
            regexPattern = '[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}';
        }
        // 9. Default: Escape
        else {
            regexPattern = selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Explicitly escape whitespace for input visibility (newline, tab)
            regexPattern = regexPattern.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        }

        // Update UI
        findInput.value = regexPattern;

        // Enable Regex Mode if not already
        if (!isRegex) {
            isRegex = true;
            toggleRegexBtn.classList.add('active');
        }

        // Show panel if hidden
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        }

        findInput.focus();
        updateOverlay();
    };

    const generateContextRegex = () => {
        // Trigger Wizard directly
        startWizard();
    };

    // --- Regex Wizard Logic ---
    let currentWizardStep = 0;
    const wizardData = { left: '', middle: '', right: '' };
    const wizardOverlay = document.getElementById('regex-wizard');
    const wizardInstruction = document.getElementById('wizard-instruction');
    const wizardStepIndicator = document.getElementById('wizard-step-indicator');

    const startWizard = () => {
        currentWizardStep = 1;
        wizardData.left = '';
        wizardData.middle = '';
        wizardData.right = '';

        if (wizardOverlay) wizardOverlay.style.display = 'block';
        updateWizardUI();
    };

    const cancelWizard = () => {
        currentWizardStep = 0;
        if (wizardOverlay) wizardOverlay.style.display = 'none';
        editor.focus();
    };

    const updateWizardUI = () => {
        if (!wizardStepIndicator || !wizardInstruction) return;

        wizardStepIndicator.textContent = `Step ${currentWizardStep} of 3`;

        if (currentWizardStep === 1) {
            wizardInstruction.innerHTML = 'Highlight the <strong>Left Context</strong> (Prefix)';
        } else if (currentWizardStep === 2) {
            wizardInstruction.innerHTML = 'Highlight the <strong>Target</strong> (Middle Part)';
        } else if (currentWizardStep === 3) {
            wizardInstruction.innerHTML = 'Highlight the <strong>Right Context</strong> (Suffix)';
        }
    };

    const handleWizardConfirm = () => {
        const text = editor.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selection = text.substring(start, end);

        if (currentWizardStep === 1) {
            wizardData.left = selection;
            currentWizardStep = 2;
            updateWizardUI();
        }
        else if (currentWizardStep === 2) {
            wizardData.middle = selection;
            currentWizardStep = 3;
            updateWizardUI();
        }
        else if (currentWizardStep === 3) {
            wizardData.right = selection;
            finishWizard();
        }
    };

    const finishWizard = () => {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let regexPattern = '';

        // 1. Left Context
        if (wizardData.left) {
            regexPattern += `(?<=${escapeRegex(wizardData.left)})`;
        }

        // 2. Middle Pattern (Smart Detect)
        const middle = wizardData.middle;
        if (!middle) {
            regexPattern += '.*?';
        } else if (/^\d+$/.test(middle)) {
            regexPattern += '\\d+';
        } else if (/^\d+\.\d+$/.test(middle)) {
            regexPattern += '\\d+\\.\\d+';
        } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(middle)) {
            regexPattern += '[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}';
        } else {
            if (/\s/.test(middle)) {
                regexPattern += '.*?';
            } else {
                regexPattern += '\\S+';
            }
        }

        // 3. Right Context
        if (wizardData.right) {
            regexPattern += `(?=${escapeRegex(wizardData.right)})`;
        }

        // Apply
        findInput.value = regexPattern;
        if (!isRegex) {
            isRegex = true;
            toggleRegexBtn.classList.add('active');
        }
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        }

        cancelWizard();
        findNext();
        updateOverlay();
    };

    const handleRegexPrompt = () => {
        const promptText = prompt('Describe what you want to match (e.g., "emails", "dates", "ip addresses"):');
        if (!promptText) return;

        const lowerPrompt = promptText.toLowerCase();
        let regexPattern = '';

        // Keyword Engine (Simple Map for now)
        if (lowerPrompt.includes('email') || lowerPrompt.includes('mail')) {
            regexPattern = '[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}';
        } else if (lowerPrompt.includes('ip') || lowerPrompt.includes('address')) {
            regexPattern = '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
        } else if (lowerPrompt.includes('hex') || lowerPrompt.includes('color')) {
            regexPattern = '#[0-9a-fA-F]{6}';
        } else if (lowerPrompt.includes('date')) {
            // Match generic dates
            regexPattern = '\\d{4}-\\d{2}-\\d{2}|\\d{2}\\/\\d{2}\\/\\d{4}';
        } else if (lowerPrompt.includes('time')) {
            regexPattern = '\\d{2}:\\d{2}(?::\\d{2})?';
        } else if (lowerPrompt.includes('phone') || lowerPrompt.includes('number')) {
            // Broad phone check if 'phone' is used, else generic number
            if (lowerPrompt.includes('phone')) {
                regexPattern = '[\\+]?[(]?[0-9]{3}[)]?[-\\s\\.]?[0-9]{3}[-\\s\\.]?[0-9]{4,6}';
            } else {
                regexPattern = '\\d+';
            }
        } else if (lowerPrompt.includes('url') || lowerPrompt.includes('link') || lowerPrompt.includes('website') || lowerPrompt.includes('domain') || /\*\.[a-z0-9-]+\.\*/.test(lowerPrompt) || /\*\.[a-z]{2,}/.test(lowerPrompt)) {
            // Check for specific TLDs in prompt (like "*.com", ".net")
            const tldMatch = lowerPrompt.match(/(?:^|\s)\*?\.([a-z]{2,})(?:\s|$)/);
            const specificTLD = tldMatch ? tldMatch[1] : null;

            // Check for specific Domain Name (like "*.google.*")
            const domainMatch = lowerPrompt.match(/(?:^|\s)\*?\.?([a-z0-9-]+)\.\*/);
            const specificDomain = domainMatch ? domainMatch[1] : null;

            if (specificDomain) {
                // Exact Domain Match (e.g. google) -> sub.google.com, google.net
                regexPattern = `\\b(?:[a-zA-Z0-9-]+\\.)+${specificDomain}\\.[a-zA-Z]{2,6}\\b`;
            } else if (specificTLD) {
                // Specific TLD Match (e.g., .com)
                regexPattern = `\\b(?:[a-zA-Z0-9-]+\\.)+${specificTLD}\\b`;
            } else {
                // Strict Generic URL: Excludes common file extensions and pure IPs
                regexPattern = '\\b(?:[a-zA-Z0-9-]+\\.)+(?!(?:txt|csv|xml|json|png|jpg|jpeg|gif|js|css|html|php)\\b)[a-zA-Z]{2,6}\\b';
            }
        } else if (lowerPrompt.includes('space') || lowerPrompt.includes('whitespace')) {
            regexPattern = '\\s+';
        } else if (lowerPrompt.includes('word')) {
            regexPattern = '\\w+';
        } else {
            // Fallback: Just treat as literal search but escaped? 
            // Or maybe user typed a regex directly? Let's assume literal for safety against errors, 
            // or just put it in as raw if it looks like regex?
            // Let's try to be smart: if it looks like regex (has special chars), use it raw.
            if (/[\\^$*+?.()|[\]{}]/.test(promptText)) {
                regexPattern = promptText;
            } else {
                regexPattern = promptText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }

        findInput.value = regexPattern;

        if (!isRegex) {
            isRegex = true;
            toggleRegexBtn.classList.add('active');
        }
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        }
        findNext();
        updateOverlay();
    };

    // --- Event Listeners ---

    // Editor Events
    editor.addEventListener('input', () => {
        updateLineNumbers();
        updateOverlay();
        updateStatusBar();

        // Debounce history save
        clearTimeout(typingTimer);
        typingTimer = setTimeout(saveState, 500);
    });

    editor.addEventListener('scroll', syncScroll);

    editor.addEventListener('keydown', (e) => {
        // Tab Key
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertText', false, '    ');
            updateStatusBar();
            saveState(); // Explicit save on tab
        }

        // Ctrl+F
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const panelDisplay = panel.style.display;
            panel.style.display = panelDisplay === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') findInput.focus();
        }

        // Undo (Ctrl+Z)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            const state = history.undo();
            if (state) {
                editor.value = state.text;
                editor.setSelectionRange(state.cursor, state.cursor);
                updateOverlay();
                updateLineNumbers();
                updateStatusBar();
                history.updateUI();
            }
        }

        // Redo (Ctrl+Y or Ctrl+Shift+Z)
        if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            const state = history.redo();
            if (state) {
                editor.value = state.text;
                editor.setSelectionRange(state.cursor, state.cursor);
                updateOverlay();
                updateLineNumbers();
                updateStatusBar();
                history.updateUI();
            }
        }
    });

    editor.addEventListener('click', updateStatusBar);
    editor.addEventListener('keyup', updateStatusBar);

    // Find/Replace Panel Events
    findInput.addEventListener('input', () => {
        currentMatchIndex = -1;
        updateOverlay();
    });

    toggleCaseBtn.addEventListener('click', () => {
        isCaseSensitive = !isCaseSensitive;
        toggleCaseBtn.classList.toggle('active', isCaseSensitive);
        updateOverlay();
    });

    toggleRegexBtn.addEventListener('click', () => {
        isRegex = !isRegex;
        toggleRegexBtn.classList.toggle('active', isRegex);
        updateOverlay();
    });

    document.getElementById('smart-regex-btn').addEventListener('click', generateSmartRegex);
    document.getElementById('context-regex-btn').addEventListener('click', generateContextRegex);
    document.getElementById('ai-regex-btn').addEventListener('click', handleRegexPrompt);

    document.getElementById('wizard-cancel-btn').addEventListener('click', cancelWizard);
    document.getElementById('wizard-confirm-btn').addEventListener('click', handleWizardConfirm);

    findNextBtn.addEventListener('click', findNext);

    findAllBtn.addEventListener('click', () => {
        currentMatchIndex = -1;
        updateOverlay();
    });

    replaceBtn.addEventListener('click', () => {
        saveState(); // Save before action
        replaceCurrent();
        saveState(); // Save after action
    });

    replaceAllBtn.addEventListener('click', () => {
        saveState(); // Save before action
        replaceAll();
        saveState(); // Save after action
    });

    // Copy/Cut MatchesActions
    document.getElementById('copy-matches-btn').addEventListener('click', copyAllMatches);

    document.getElementById('cut-matches-btn').addEventListener('click', async () => {
        saveState(); // Save before cut
        await cutAllMatches();
        saveState(); // Save after cut
    });

    // Toggle Button
    toggleFindBtn.addEventListener('click', () => {
        const panelDisplay = panel.style.display;
        panel.style.display = panelDisplay === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') findInput.focus();
    });

    // Undo/Redo UI Buttons
    document.getElementById('undo-btn').addEventListener('click', () => {
        const state = history.undo();
        if (state) {
            editor.value = state.text;
            editor.setSelectionRange(state.cursor, state.cursor);
            editor.focus();
            updateOverlay();
            updateLineNumbers();
            updateStatusBar();
            history.updateUI();
        }
    });

    document.getElementById('redo-btn').addEventListener('click', () => {
        const state = history.redo();
        if (state) {
            editor.value = state.text;
            editor.setSelectionRange(state.cursor, state.cursor);
            editor.focus();
            updateOverlay();
            updateLineNumbers();
            updateStatusBar();
            history.updateUI();
        }
    });

    // --- New Features (Wrap & Full Screen) ---

    // --- New Features (Wrap & Full Screen) ---

    const toggleWrapBtn = document.getElementById('toggle-wrap-btn');
    const toggleFullScreenBtn = document.getElementById('toggle-fullscreen-btn');
    const editorContainer = document.querySelector('.editor-container');

    let isWrapEnabled = false;
    let isFullScreen = false;

    // Word Wrap Toggle
    toggleWrapBtn.addEventListener('click', () => {
        isWrapEnabled = !isWrapEnabled;
        editorContainer.classList.toggle('wrap-enabled', isWrapEnabled);
        toggleWrapBtn.classList.toggle('active', isWrapEnabled);

        // Update overlay to ensure alignment persists
        updateOverlay();
    });

    // Full Screen Toggle
    toggleFullScreenBtn.addEventListener('click', () => {
        isFullScreen = !isFullScreen;
        document.body.classList.toggle('full-screen-mode', isFullScreen);
        toggleFullScreenBtn.classList.toggle('active', isFullScreen);

        // Adjust icon or state if needed (optional)
        if (isFullScreen) {
            // Logic if needed when entering FS
        } else {
            // Logic if needed when exiting FS
        }
    });

    // --- Text Operations (Tools) ---
    const toolsPanel = document.getElementById('tools-panel');
    const toggleToolsBtn = document.getElementById('toggle-tools-btn');

    // Helper to get text to operate on (Selection or All)
    const getTargetText = () => {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start === end) {
            return { text: editor.value, start: 0, end: editor.value.length, isSelection: false };
        }
        return { text: editor.value.substring(start, end), start, end, isSelection: true };
    };

    const applyTextOp = (newText, start, end, isSelection) => {
        saveState();
        if (isSelection) {
            document.execCommand('insertText', false, newText);
        } else {
            editor.value = newText;
            updateOverlay();
            updateLineNumbers();
            updateStatusBar();
        }
        saveState();
    };

    // Case Conversion
    const convertCase = (type) => {
        const { text, start, end, isSelection } = getTargetText();
        let result = text;

        if (type === 'upper') {
            result = text.toUpperCase();
        } else if (type === 'lower') {
            result = text.toLowerCase();
        } else if (type === 'title') {
            result = text.replace(/\b\w/g, c => c.toUpperCase());
        }

        applyTextOp(result, start, end, isSelection);
    };

    document.getElementById('btn-upper').addEventListener('click', () => convertCase('upper'));
    document.getElementById('btn-lower').addEventListener('click', () => convertCase('lower'));
    document.getElementById('btn-title').addEventListener('click', () => convertCase('title'));

    // Sorting
    const sortLines = (direction) => {
        const { text, start, end, isSelection } = getTargetText();
        // Handle trailing newline for full text vs selection
        // Determine splitting strategy safely

        let lines = text.split('\n');

        // If it's a selection and doesn't encompass whole lines properly, this might be weird.
        // But standard behavior is just sort the lines found in the range.

        if (direction === 'asc') {
            lines.sort();
        } else {
            lines.sort().reverse();
        }

        const result = lines.join('\n');
        applyTextOp(result, start, end, isSelection);
    };

    document.getElementById('btn-sort-asc').addEventListener('click', () => sortLines('asc'));
    document.getElementById('btn-sort-desc').addEventListener('click', () => sortLines('desc'));

    // Remove Duplicates
    const removeDuplicates = () => {
        const { text, start, end, isSelection } = getTargetText();
        const lines = text.split('\n');
        const uniqueLines = [...new Set(lines)];
        const result = uniqueLines.join('\n');

        applyTextOp(result, start, end, isSelection);
    };

    document.getElementById('btn-dedupe').addEventListener('click', removeDuplicates);

    // Toggle Tools Panel
    toggleToolsBtn.addEventListener('click', () => {
        const display = toolsPanel.style.display;
        toolsPanel.style.display = display === 'none' ? 'block' : 'none';

        // Hide Find panel if open to prevent clutter
        if (toolsPanel.style.display === 'block') {
            panel.style.display = 'none';
        }
    });

    // Update Find Toggle to hide Tools panel
    // (Existing listener modification or addition)
    toggleFindBtn.addEventListener('click', () => {
        // ... (existing logic) ...
        if (panel.style.display === 'block') {
            toolsPanel.style.display = 'none';
        }
    });

    // Initial Setup
    updateLineNumbers();
    updateStatusBar();
});
