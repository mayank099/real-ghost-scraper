import { StateManager } from '/utils/state-manager.js';
import { MessageHandlers } from '/utils/message-handlers.js';
import { NavigationManager } from '/utils/navigation-utils.js';
import { generateCsvContent } from '/utils/csv-utils.js';
import { extractBaseUrl } from '/utils/url-utils.js';

let isProcessing = false;
let stateManager;
let messageHandlers;
let navigationManager;

// Initialize the extension
async function initialize() {
    try {
        stateManager = new StateManager();
        await stateManager.loadState();

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs.length) {
            throw new Error('No active tab found');
        }

        const tab = tabs[0];
        const baseUrl = extractBaseUrl(tab.url);

        messageHandlers = new MessageHandlers(stateManager.state, tab.id);
        navigationManager = new NavigationManager(tab.id, baseUrl);
    } catch (error) {
        console.error('Initialization failed:', error);
        throw error;
    }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(error => {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message });
    });
    return true;
});

// Initialize on startup
initialize().catch(error => {
    console.error('Failed to initialize:', error);
});

async function handleMessage(message, sender) {
    if (!stateManager || !messageHandlers) {
        await initialize();
    }

    switch (message.action) {
        case 'startScraping':
            isProcessing = true;
            return messageHandlers.handleStartScraping(message);
        case 'urlsCollected':
            return messageHandlers.handleUrlsCollected(message);
        case 'propertyDetailsScraped':
            return messageHandlers.handlePropertyDetailsScraped(message, message.details);
        case 'downloadCSV':
            return handleCsvDownload();
        case 'stopScraping':
            isProcessing = false;
            return messageHandlers.handleStopScraping();
        case 'getScrapingStatus':
            return {
                isProcessing,
                ...stateManager.getStatistics()
            };
        default:
            throw new Error(`Unknown action: ${message.action}`);
    }
}

async function handleCsvDownload() {
    try {
        const { urls, scrapedData, statistics } = stateManager.getExportData();
        if (scrapedData.length === 0) {
            throw new Error('No data available for export');
        }

        const csvContent = generateCsvContent(scrapedData);
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
