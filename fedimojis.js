// ==UserScript==
// @name         Fedimoji Downloader
// @namespace    https://www.greasespot.net/
// @version      1.0
// @description  Downloads emojis from emojos.in
// @author       em
// @match        https://emojos.in/*
// @grant        GM.xmlHttpRequest
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Constants
    const DOWNLOAD_DELAY = 50; // ms
    const COMPRESSION_OPTIONS = {
        type: 'blob',
        compression: 'STORE'
    };
    const USER_AGENT = 'EmojiDownloader/1.0';
    const STYLES = {
        buttonBackground: 'rgb(40, 44, 55)',
        buttonBorder: '#B86EFF',
        buttonBorderHover: '#9747FF',
        successColor: '#00E49A',
        errorColor: '#FF2E5F',
        warningColor: '#FFBF00',
        textColor: 'white',
        downloadingText: 'rgb(217, 225, 232)'
    };
    const MESSAGES = {
        NO_EMOJIS: 'No emojis found on this page!',
        STARTING: 'Starting download...',
        STOPPING: 'Stopping...',
        CREATING_ZIP: 'Creating zip file...',
        DOWNLOAD_CANCELED: 'Download canceled.',
        ZIP_ERROR: 'Failed to create zip file. Please try again.',
        DOWNLOAD_COMPLETE: (count, size, errors) =>
            `Successfully downloaded ${count} emojis (${size} MB)\n${errors} errors occurred.`
    };
    const STATUS_TEXTS = {
        downloading: '⏳ downloading...',
        downloaded: '✓ downloaded',
        error: '❌ failed'
    };

    // Button management class
    class DownloadButton {
        constructor(element) {
            this.element = element;
            this.isDownloading = false;
            this.shouldStop = false;
        }

        setLoading() {
            this.element.classList.add('downloading');
            this.element.textContent = MESSAGES.STARTING;
            this.isDownloading = true;
            this.shouldStop = false;
        }

        setStopping() {
            this.element.textContent = MESSAGES.STOPPING;
            this.element.disabled = true;
            this.shouldStop = true;
        }

        reset() {
            this.isDownloading = false;
            this.shouldStop = false;
            this.element.disabled = false;
            this.element.textContent = 'Download All Emojis';
            this.element.classList.remove('downloading');
        }

        updateProgress(current, total) {
            if (!Number.isFinite(current) || !Number.isFinite(total)) {
                console.warn('Invalid progress values:', { current, total });
                return;
            }
            this.element.textContent = `Downloading... (${current}/${total})`;
        }

        setCreatingZip() {
            this.element.textContent = MESSAGES.CREATING_ZIP;
        }
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #downloadBtn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            padding: 10px 20px;
            border: 2px solid ${STYLES.buttonBorder};
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            color: ${STYLES.textColor};
            font-family: sans-serif;
            background: ${STYLES.buttonBackground};
            min-width: 160px;
            text-align: center;
            transition: all 0.2s;
        }
        #downloadBtn:not(.downloading):hover {
            background: ${STYLES.buttonBackground};
            border-color: ${STYLES.buttonBorderHover};
            box-shadow: 0 0 10px ${STYLES.buttonBorder}40;
        }
        #downloadBtn.downloading {
            background: ${STYLES.successColor};
        }
        #downloadBtn.downloading:hover {
            background: ${STYLES.warningColor};
        }
        #downloadBtn.downloading:hover::after {
            content: 'Click to stop';
            position: absolute;
            bottom: 100%;
            right: 0;
            background: ${STYLES.buttonBackground};
            padding: 5px 10px;
            border-radius: 4px;
            margin-bottom: 5px;
            font-size: 12px;
            white-space: nowrap;
        }
        #downloadBtn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        dl.emojo dd.downloading {
            color: ${STYLES.downloadingText};
        }
        dl.emojo dd.downloaded {
            color: ${STYLES.successColor};
        }
        dl.emojo dd.error {
            color: ${STYLES.errorColor};
        }
    `;
    document.head.appendChild(style);

    // Create button
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'downloadBtn';
    downloadBtn.textContent = 'Download All Emojis';
    document.body.appendChild(downloadBtn);

    // Initialize button manager
    const buttonManager = new DownloadButton(downloadBtn);

    // Helper functions
    function getInstanceName() {
        // Try to get instance from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const pathInstance = window.location.pathname.split('/')[1];
        const instance = urlParams.get('instance') || // For newer URL format
                        (pathInstance && pathInstance !== '' ? pathInstance : null) || // For path-based format
                        'unknown-instance';

        // Clean the instance name
        return instance.replace(/[^a-zA-Z0-9.-]/g, '-');
    }

    function updateEmojiStatus(dd, status) {
        if (!dd || !STATUS_TEXTS[status]) {
            console.warn('Invalid status update:', { dd, status });
            return;
        }
        dd.textContent = STATUS_TEXTS[status];
        dd.className = status;
    }

    function fetchImage(url) {
        if (typeof url !== 'string' || !url.startsWith('http')) {
            return Promise.reject(new Error('Invalid URL'));
        }

        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': USER_AGENT
                },
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(response.response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: reject
            });
        });
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function generateAndDownloadZip(zip, processedCount, totalSize, errorCount) {
        try {
            buttonManager.setCreatingZip();
            const content = await zip.generateAsync(COMPRESSION_OPTIONS);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const instanceName = getInstanceName();
            const filename = `${timestamp}-${instanceName}-emojis.zip`;

            const a = document.createElement('a');
            const url = URL.createObjectURL(content);
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            alert(MESSAGES.DOWNLOAD_COMPLETE(processedCount, sizeMB, errorCount));
        } catch (error) {
            console.error('Failed to create zip file:', error);
            alert(MESSAGES.ZIP_ERROR);
        }
    }

    // Main download function
    async function downloadImages() {
        if (buttonManager.isDownloading) {
            buttonManager.setStopping();
            return;
        }

        const zip = new JSZip();
        const emojiDivs = document.querySelectorAll('dl.emojo div');
        let processedCount = 0;
        let errorCount = 0;
        let totalSize = 0;

        buttonManager.setLoading();

        if (emojiDivs.length === 0) {
            alert(MESSAGES.NO_EMOJIS);
            buttonManager.reset();
            return;
        }

        // Process each emoji
        for (const div of emojiDivs) {
            if (buttonManager.shouldStop) break;

            const img = div.querySelector('img');
            const dd = div.querySelector('dd');

            if (!img?.src || !img?.alt ||
                typeof img.src !== 'string' ||
                typeof img.alt !== 'string' ||
                !dd) continue;

            try {
                updateEmojiStatus(dd, 'downloading');
                buttonManager.updateProgress(processedCount, emojiDivs.length);

                const fileName = img.alt.replace(/:/g, '') + '.png';
                const arrayBuffer = await fetchImage(img.src);

                if (arrayBuffer) {
                    zip.file(fileName, arrayBuffer, {binary: true});
                    totalSize += arrayBuffer.byteLength;
                    processedCount++;
                    updateEmojiStatus(dd, 'downloaded');
                }

                await delay(DOWNLOAD_DELAY);
            } catch (error) {
                console.error(`Failed to download ${img.alt}:`, error);
                errorCount++;
                updateEmojiStatus(dd, 'error');
            }
        }

        // Generate and download zip file
        if (processedCount > 0 && !buttonManager.shouldStop) {
            await generateAndDownloadZip(zip, processedCount, totalSize, errorCount);
        } else if (buttonManager.shouldStop) {
            alert(MESSAGES.DOWNLOAD_CANCELED);
        }

        buttonManager.reset();
    }

    // Event listener
    downloadBtn.addEventListener('click', downloadImages);
})();
