document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileListPreview = document.getElementById('file-list-preview');
    const findBtn = document.getElementById('find-btn');
    const resultsHeader = document.getElementById('results-header');
    const resultsList = document.getElementById('results-list');
    const exportBtn = document.getElementById('export-btn');

    let selectedFiles = [];
    let duplicateResults = [];

    // --- File Handling (Shared Logic) ---
    // In a production app, we'd modularize this. For now, duplication is acceptable to keep files standalone.

    function updateFileList() {
        fileListPreview.innerHTML = '';
        if (selectedFiles.length === 0) {
            return;
        }

        selectedFiles.forEach((file, index) => {
            const tag = document.createElement('div');
            tag.className = 'file-tag';
            tag.innerHTML = `
                <span>${file.name}</span>
                <span style="cursor:pointer; opacity: 0.7;" onclick="removeFile(${index})">×</span>
            `;
            fileListPreview.appendChild(tag);
        });
    }

    window.removeFile = (index) => {
        selectedFiles.splice(index, 1);
        fileInput.value = '';
        updateFileList();
    };

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            selectedFiles = [...selectedFiles, ...Array.from(e.target.files)];
            updateFileList();
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('drag-over');
    }

    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            selectedFiles = [...selectedFiles, ...Array.from(files)];
            updateFileList();
        }
    }

    // --- Duplicate Logic ---

    findBtn.addEventListener('click', async () => {
        const textInput = document.getElementById('text-input');
        const hasText = textInput && textInput.value.trim().length > 0;

        if (selectedFiles.length === 0 && !hasText) {
            alert('Please select files or paste text to proceed.');
            return;
        }

        const originalBtnText = findBtn.querySelector('.btn-text').textContent;
        findBtn.querySelector('.btn-text').textContent = 'Processing...';
        findBtn.disabled = true;

        resultsList.innerHTML = '';
        resultsHeader.style.display = 'none';

        try {
            await findDuplicates();
        } catch (error) {
            console.error('Processing failed:', error);
            resultsList.innerHTML = `<div class="glass-panel no-results" style="color: var(--danger);">
                <p>An error occurred:</p>
                <p style="font-size: 0.9em; margin-top: 5px;">${error.message}</p>
            </div>`;
        } finally {
            findBtn.querySelector('.btn-text').textContent = originalBtnText;
            findBtn.disabled = false;
        }
    });

    async function findDuplicates() {
        // Map<LineContent, {count, locations: [{file, line}]}>
        const lineMap = new Map();

        const textInput = document.getElementById('text-input');
        const rawText = textInput ? textInput.value : '';

        // Initial process for raw text
        if (rawText.trim().length > 0) {
            const lines = rawText.split(/\r\n|\n/);
            lines.forEach((line, index) => {
                const trimmedLine = line.trim();
                if (trimmedLine.length === 0) return;

                if (!lineMap.has(trimmedLine)) {
                    lineMap.set(trimmedLine, {
                        count: 0,
                        locations: []
                    });
                }

                const entry = lineMap.get(trimmedLine);
                entry.count++;
                entry.locations.push({
                    fileName: 'Direct Input',
                    lineNumber: index + 1
                });
            });
        }

        const promises = selectedFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = (e) => {
                    const content = e.target.result;
                    // Split, but preserve empty lines? Usually duplicates of empty lines aren't interesting.
                    // Let's filter out empty lines for noise reduction.
                    const lines = content.split(/\r\n|\n/);

                    lines.forEach((line, index) => {
                        const trimmedLine = line.trim();
                        if (trimmedLine.length === 0) return;

                        if (!lineMap.has(trimmedLine)) {
                            lineMap.set(trimmedLine, {
                                count: 0,
                                locations: []
                            });
                        }

                        const entry = lineMap.get(trimmedLine);
                        entry.count++;
                        entry.locations.push({
                            fileName: file.name,
                            lineNumber: index + 1
                        });
                    });

                    resolve();
                };

                reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
                reader.readAsText(file);
            });
        });

        await Promise.all(promises);

        // Sort descending by count
        duplicateResults = Array.from(lineMap.entries())
            .sort((a, b) => b[1].count - a[1].count);

        if (duplicateResults.length === 0) {
            resultsList.innerHTML = `
                <div class="glass-panel no-results">
                    <p>No text content found!</p>
                </div>
            `;
            return;
        }

        renderResults();
    }

    function renderResults() {
        resultsHeader.style.display = 'flex';

        let html = `
            <div class="glass-panel duplicate-table-wrapper">
                <table class="duplicate-table">
                    <thead>
                        <tr>
                            <th style="width: 80px;">Count</th>
                            <th>Line Content</th>
                            <th style="width: 60px;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Limit display to top 500 to prevent DOM freeze if massive duplicates
        const displayLimit = 500;
        const itemsToShow = duplicateResults.slice(0, displayLimit);

        itemsToShow.forEach(([content, data]) => {
            html += `
                <tr>
                    <td><span class="count-badge">${data.count}</span></td>
                    <td class="line-content-cell">${escapeHtml(content)}</td>
                    <td>
                        <button class="copy-icon-btn" data-content="${escapeHtml(content)}" title="Copy to Clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
        `;

        if (duplicateResults.length > displayLimit) {
            html += `<div style="text-align: center; padding: 1rem; color: var(--text-secondary);">
                Showing top ${displayLimit} of ${duplicateResults.length} duplicates. Export to see all.
            </div>`;
        }

        html += `</div>`;
        resultsList.innerHTML = html;
    }

    // Event Delegation for Copy Button
    resultsList.addEventListener('click', (e) => {
        const btn = e.target.closest('.copy-icon-btn');
        if (!btn) return;

        const content = btn.getAttribute('data-content');
        if (content) {
            navigator.clipboard.writeText(content).then(() => {
                // Visual feedback
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                btn.classList.add('copied');

                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copied');
                }, 1500);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    });

    // --- Export & Copy Logic ---

    function generateCSVContent() {
        if (!duplicateResults || duplicateResults.length === 0) return null;

        // CSV Header
        let content = 'Count,Line Content\n';

        duplicateResults.forEach(([lineContent, data]) => {
            // Escape double quotes by doubling them, wrap content in quotes
            const escapedContent = `"${lineContent.replace(/"/g, '""')}"`;
            content += `${data.count},${escapedContent}\n`;
        });

        return content;
    }

    const copyReportBtn = document.getElementById('copy-report-btn');
    const copyLinesBtn = document.getElementById('copy-lines-btn');

    copyLinesBtn.addEventListener('click', () => {
        if (!duplicateResults || duplicateResults.length === 0) return;

        // Generate just the lines, newline separated
        const content = duplicateResults.map(([lineContent, _]) => lineContent).join('\n');

        navigator.clipboard.writeText(content).then(() => {
            const originalHTML = copyLinesBtn.innerHTML;
            copyLinesBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
            setTimeout(() => {
                copyLinesBtn.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy lines: ', err);
            alert('Failed to copy lines to clipboard');
        });
    });

    copyReportBtn.addEventListener('click', () => {
        const content = generateCSVContent();
        if (!content) return;

        navigator.clipboard.writeText(content).then(() => {
            const originalHTML = copyReportBtn.innerHTML;
            copyReportBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
            setTimeout(() => {
                copyReportBtn.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy report: ', err);
            alert('Failed to copy report to clipboard');
        });
    });

    exportBtn.addEventListener('click', () => {
        const content = generateCSVContent();
        if (!content) return;

        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'duplicate_report.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
