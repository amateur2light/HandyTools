

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileListPreview = document.getElementById('file-list-preview');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const resultsHeader = document.getElementById('results-header');
    const resultsList = document.getElementById('results-list');
    const bulkExportBtn = document.getElementById('bulk-export-btn');
    const exportKeywordBtn = document.getElementById('export-keyword-btn');

    let selectedFiles = [];

    // Store current results for global export
    let currentResults = [];

    // --- File Handling ---

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

    // Expose removeFile to global scope so onclick works
    window.removeFile = (index) => {
        selectedFiles.splice(index, 1);
        // Reset file input value to allow re-selecting the same file if needed
        fileInput.value = '';
        updateFileList();
    };

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            selectedFiles = [...selectedFiles, ...Array.from(e.target.files)];
            updateFileList();
        }
    });

    // Drag and drop effects
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

    // --- Search Logic ---

    function triggerExport(fileName, content) {
        const element = document.createElement('a');
        const file = new Blob([content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = fileName;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    }

    // Export a single file's results
    window.exportSingle = (index) => {
        const result = currentResults[index];
        if (!result) return;

        let content = `File: ${result.fileName}\n`;
        content += `Matches: ${result.matches.length}\n`;
        content += '-'.repeat(30) + '\n';
        result.matches.forEach(m => {
            content += `Line ${m.lineNumber}: ${m.content.replace(/<[^>]*>/g, '')}\n`;
            content += `Matched Keywords: ${m.foundTerms.join(', ')}\n\n`;
        });

        triggerExport(`${result.fileName}_search_results.txt`, content);
    };

    bulkExportBtn.addEventListener('click', () => {
        if (!currentResults || currentResults.length === 0) return;

        let content = '';
        currentResults.forEach(result => {
            content += `File: ${result.fileName}\n`;
            content += `Matches: ${result.matches.length}\n`;
            content += '-'.repeat(30) + '\n';
            result.matches.forEach(m => {
                content += `Line ${m.lineNumber}: ${m.content.replace(/<[^>]*>/g, '')}\n`;
                content += `Matched Keywords: ${m.foundTerms.join(', ')}\n\n`;
            });
            content += '='.repeat(50) + '\n\n';
        });

        triggerExport('all_search_results.txt', content);
    });

    exportKeywordBtn.addEventListener('click', () => {
        if (!currentResults || currentResults.length === 0) return;

        // Group by keyword
        const grouped = {};

        currentResults.forEach(result => {
            result.matches.forEach(match => {
                match.foundTerms.forEach(term => {
                    const normalizedTerm = term.toLowerCase();

                    if (!grouped[normalizedTerm]) {
                        grouped[normalizedTerm] = [];
                    }
                    grouped[normalizedTerm].push({
                        fileName: result.fileName,
                        lineNumber: match.lineNumber,
                        content: match.content,
                        originalTerm: term
                    });
                });
            });
        });

        let content = 'EXPORT BY KEYWORD\n';
        content += '=================\n\n';

        Object.keys(grouped).sort().forEach(key => {
            content += `KEYWORD: ${grouped[key][0].originalTerm.toUpperCase()} (${key})\n`;
            content += '-'.repeat(30) + '\n';

            grouped[key].forEach(item => {
                content += `File: ${item.fileName} | Line: ${item.lineNumber}\n`;
                content += `Content: ${item.content.replace(/<[^>]*>/g, '')}\n\n`;
            });
            content += '\n';
        });

        triggerExport('keyword_search_results.txt', content);
    });

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim();

        if (!query) {
            alert('Please enter a search term.');
            return;
        }

        if (selectedFiles.length === 0) {
            alert('Please select at least one file.');
            return;
        }

        // Set loading state
        const originalBtnText = searchBtn.querySelector('.btn-text').textContent;
        searchBtn.querySelector('.btn-text').textContent = 'Searching...';
        searchBtn.disabled = true;

        resultsList.innerHTML = ''; // Clear previous results
        resultsHeader.style.display = 'none'; // Hide header initially
        currentResults = [];

        try {
            await performSearch(query);
        } catch (error) {
            console.error('Search failed:', error);
            resultsList.innerHTML = `<div class="glass-panel no-results" style="color: var(--danger);">
                <p>An error occurred:</p>
                <p style="font-size: 0.9em; margin-top: 5px;">${error.message}</p>
            </div>`;
        } finally {
            // Reset loading state
            searchBtn.querySelector('.btn-text').textContent = originalBtnText;
            searchBtn.disabled = false;
        }
    });

    async function performSearch(rawQuery) {
        let totalMatches = 0;
        let filesWithMatches = 0;
        const resultsHTML = [];

        // Split by newlines (CR, LF, CRLF) or commas
        // The regex /[\r\n,]+/ matches one or more occurrences of newline characters or commas
        // This ensures "word1\r\nword2" becomes ["word1", "word2"]
        const terms = rawQuery.split(/[\r\n,]+/)
            .map(term => term.trim())
            .filter(term => term.length > 0);

        if (terms.length === 0) {
            resultsList.innerHTML = '<div class="no-results">Please enter valid search terms.</div>';
            return;
        }

        // Create a single regex to match ANY of the terms
        // Escape each term to avoid regex insertion attacks
        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = `(${escapedTerms.join('|')})`;
        const regex = new RegExp(pattern, 'gi'); // Case insensitive

        const promises = selectedFiles.map(file => {
            return new Promise(async (resolve, reject) => {
                const extension = file.name.split('.').pop().toLowerCase();

                try {
                    let content = '';

                    if (extension === 'docx') {
                        content = await readDocxFile(file);
                    } else {
                        // Default to text
                        content = await readTextFile(file);
                    }

                    const lines = content.split(/\r\n|\n/);
                    const fileMatches = [];

                    lines.forEach((line, index) => {
                        // Check if line contains ANY of the terms
                        if (line.search(regex) !== -1) {
                            const found = line.match(regex);
                            // Highlight all occurrences
                            const highlightedLine = line.replace(regex, '<mark>$1</mark>');
                            fileMatches.push({
                                lineNumber: index + 1,
                                content: highlightedLine,
                                foundTerms: found ? [...new Set(found)] : []
                            });
                        }
                    });

                    if (fileMatches.length > 0) {
                        filesWithMatches++;
                        totalMatches += fileMatches.length;
                        resolve({
                            fileName: file.name,
                            matches: fileMatches
                        });
                    } else {
                        resolve(null);
                    }

                } catch (error) {
                    console.error(`Error processing ${file.name}:`, error);
                    // Resolve null instead of rejecting to allow other files to finish
                    resolve(null);
                }
            });
        });

        const results = await Promise.all(promises);

        // Filter out nulls (files with no matches)
        const validResults = results.filter(r => r !== null);

        // Save to global variable for export
        currentResults = validResults;

        if (validResults.length === 0) {
            resultsList.innerHTML = `
                <div class="glass-panel no-results">
                    <p>No matches found.</p>
                </div>
            `;
            return;
        }

        // Show results header
        resultsHeader.style.display = 'flex';

        // Build HTML
        validResults.forEach((result, index) => {
            const matchItems = result.matches.map(m => `
                <div class="result-line">
                    <span class="line-number">${m.lineNumber}</span>
                    <div class="line-content">${m.content}</div>
                </div>
            `).join('');

            const fileCard = `
                <div class="result-card">
                    <div class="file-name-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        <span>${result.fileName}</span>
                        <div class="file-header-actions">
                            <span class="match-count">${result.matches.length} matches</span>
                            <button class="secondary-btn" onclick="exportSingle(${index})" title="Export this file results">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </button>
                        </div>
                    </div>
                    ${matchItems}
                </div>
            `;
            resultsHTML.push(fileCard);
        });

        resultsList.innerHTML = resultsHTML.join('');
    }
    async function readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    async function readDocxFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                mammoth.extractRawText({ arrayBuffer: e.target.result })
                    .then(result => resolve(result.value))
                    .catch(err => reject(err));
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }
});
