// Core functionality for background script
export class BackgroundCore {
    constructor() {
        this.isProcessing = false;
        this.stateManager = null;
        this.messageHandlers = null;
        this.navigationManager = null;
        this.utils = null;
    }


    async initialize() {
        try {
            // Load all required utilities
            const [
                { StateManager },
                { MessageHandlers },
                { NavigationManager },
                { extractBaseUrl },
                { generateCsvContent }
            ] = await Promise.all([
                import(chrome.runtime.getURL('utils/state-manager.js')),
                import(chrome.runtime.getURL('utils/message-handlers.js')),
                import(chrome.runtime.getURL('utils/navigation-utils.js')),
                import(chrome.runtime.getURL('utils/url-utils.js')),
                import(chrome.runtime.getURL('utils/csv-utils.js'))
            ]);

            // Store the utilities for later use
            this.utils = {
                StateManager,
                MessageHandlers,
                NavigationManager,
                extractBaseUrl,
                generateCsvContent
            };

            // Initialize state manager
            this.stateManager = new this.utils.StateManager();
            await this.stateManager.loadState();

            // Get active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs.length) {
                throw new Error('No active tab found');
            }

            const tab = tabs[0];
            const baseUrl = this.utils.extractBaseUrl(tab.url);

            // Initialize managers
            this.messageHandlers = new this.utils.MessageHandlers(this.stateManager.state, tab.id);
            this.navigationManager = new this.utils.NavigationManager(tab.id, baseUrl);
        } catch (error) {
            console.error('Failed to initialize utilities:', error);
            throw error;
        }
    }

    async handleMessage(message, sender) {
        if (!this.stateManager || !this.messageHandlers) {
            await this.initialize();
        }

        switch (message.action) {
            case 'startScraping':
                this.isProcessing = true;
                return this.messageHandlers.handleStartScraping(message);

            case 'urlsCollected':
                return this.messageHandlers.handleUrlsCollected(message);

            case 'propertyDetailsScraped':
                return this.messageHandlers.handlePropertyDetailsScraped(message, message.details);

            case 'downloadCSV':
                return this.handleCsvDownload();

            case 'stopScraping':
                this.isProcessing = false;
                return this.messageHandlers.handleStopScraping();

            case 'getScrapingStatus':
                return {
                    isProcessing: this.isProcessing,
                    ...this.stateManager.getStatistics()
                };

            default:
                throw new Error(`Unknown action: ${message.action}`);
        }
    }

    async handleCsvDownload() {
        try {
            const { urls, scrapedData, statistics } = this.stateManager.getExportData();

            if (scrapedData.length === 0) {
                throw new Error('No data available for export');
            }

            const csvContent = this.utils.generateCsvContent(scrapedData);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `realestate_properties_${timestamp}.csv`;
            const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);

            await chrome.downloads.download({
                url: dataUrl,
                filename: filename,
                saveAs: true
            });

            return { status: 'success', filename };
        } catch (error) {
            console.error('CSV Generation Error:', error);
            throw new Error(`Failed to generate CSV: ${error.message}`);
        }
    }

    startProgressCheck() {
        setInterval(() => {
            if (!this.isProcessing || !this.stateManager) return;

            const now = Date.now();
            if (!this.stateManager.state.urlCollectionComplete &&
                this.stateManager.state.lastUrlCollectionTime &&
                (now - this.stateManager.state.lastUrlCollectionTime > 10 * 60 * 1000)) {

                // Resume URL collection
                this.messageHandlers.handleUrlsCollected({
                    pageNumber: this.stateManager.state.currentPage,
                    urls: []
                }).catch(console.error);
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }
}
