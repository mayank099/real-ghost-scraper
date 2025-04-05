import { organizePropertyData, createErrorRecord, calculateProgress } from './data-utils.js';
import { scrapePropertyDetails } from './scraping-utils.js';
import { formatPropertyUrls } from './url-utils.js';
import { clearCookiesAndDelay, calculateBackoffDelay } from './cookie-utils.js';

export class MessageHandlers {
    constructor(state, tabId) {
        this.state = state;
        this.tabId = tabId;
    }

    // Handle start scraping message
    async handleStartScraping(message) {
        console.log('Starting fresh scraping process...');

        // Reset state
        Object.assign(this.state, {
            currentPage: message.startPage,
            endPage: message.endPage,
            urlCollectionComplete: false,
            propertyUrls: [],
            scrapedData: [],
            errors: [],
            currentBatchIndex: 0,
            lastUrlCollectionTime: null,
            originalPageUrl: message.url || ''
        });

        return { status: "Starting scraping process" };
    }

    // Handle URLs collected message
    async handleUrlsCollected(message) {
        try {
            // Validate URLs
            if (!message.urls || !Array.isArray(message.urls)) {
                throw new Error('Invalid URL data received');
            }

            // Format URLs
            const formattedUrls = formatPropertyUrls(message.urls);

            // Update state
            this.state.propertyUrls = [...this.state.propertyUrls, ...formattedUrls];
            this.state.lastUrlCollectionTime = Date.now();

            // Send progress update
            await this._sendUrlCollectionProgress(message, formattedUrls);

            // Handle pagination
            if (message.pageNumber < this.state.endPage) {
                await this._moveToNextPage();
            } else {
                await this._finishUrlCollection();
            }

            return { status: "Processing URLs" };
        } catch (error) {
            await this._handleUrlCollectionError(error, message);
            return { status: "Error processing URLs" };
        }
    }

    // Handle property details scraped message
    async handlePropertyDetailsScraped(message, details) {
        try {
            const propertyIndex = message.propertyIndex;

            // Validate index
            if (!this._validatePropertyIndex(propertyIndex)) {
                return { status: "Error: Invalid property index" };
            }

            // Store scraped data
            await this._storePropertyData(propertyIndex, details);

            // Send progress update
            await this._sendDetailProgress(propertyIndex);

            // Process next property
            await this._processNextProperty(propertyIndex);

            return { status: "Property details saved successfully" };
        } catch (error) {
            console.error("Error handling property details:", error);
            return { status: "Error processing property details" };
        }
    }

    // Handle stop scraping message
    async handleStopScraping() {
        // Clean up valid data
        const validScrapedData = this.state.scrapedData.filter(item => item !== undefined);
        this.state.scrapedData = validScrapedData;

        // Send completion messages
        await this._sendCompletionMessages(true);

        return { status: "Stopped scraping process" };
    }

    // Helper methods - prefixed with _ to indicate internal use
    async _sendUrlCollectionProgress(message, formattedUrls) {
        chrome.runtime.sendMessage({
            action: 'urlCollectionProgress',
            currentPage: message.pageNumber,
            totalPages: this.state.endPage,
            newUrls: formattedUrls.length,
            totalUrls: this.state.propertyUrls.length,
            pageSuccess: formattedUrls.length > 0
        });
    }

    async _moveToNextPage() {
        this.state.currentPage++;
        await collectAllPropertyUrls();
    }

    async _finishUrlCollection() {
        this.state.urlCollectionComplete = true;
        this.state.currentBatchIndex = 0;

        if (this.state.propertyUrls.length === 0) {
            throw new Error('No valid property URLs were collected');
        }

        await processBatch();
    }

    async _handleUrlCollectionError(error, message) {
        this.state.errors.push(createErrorRecord({
            phase: 'url_collection',
            page: message.pageNumber,
            error
        }));

        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: `Error collecting URLs: ${error.message}`
        });

        if (error.message.includes('No valid property URLs')) {
            await this._sendCompletionMessages(false, error.message);
        }
    }

    _validatePropertyIndex(index) {
        return index !== undefined &&
            index >= 0 &&
            this.state.propertyUrls[index];
    }

    async _storePropertyData(index, details) {
        const propertyUrl = this.state.propertyUrls[index].url;
        this.state.scrapedData[index] = {
            ...details,
            url: propertyUrl,
            scrapeStatus: 'success',
            scrapedAt: new Date().toISOString()
        };
    }

    async _sendDetailProgress(propertyIndex) {
        const progress = calculateProgress(
            propertyIndex,
            this.state.batchSize,
            this.state.propertyUrls.length
        );

        chrome.runtime.sendMessage({
            action: 'detailProgress',
            ...progress,
            propertyAddress: this.state.scrapedData[propertyIndex].address
        });
    }

    async _processNextProperty(propertyIndex) {
        const startIdx = this.state.currentBatchIndex * this.state.batchSize;
        const endIdx = Math.min(startIdx + this.state.batchSize, this.state.propertyUrls.length);

        if (propertyIndex === endIdx - 1) {
            await this._moveToNextBatch();
        } else {
            await this._scrapeNextProperty(propertyIndex, endIdx);
        }
    }

    async _sendCompletionMessages(isPartial = false, error = null) {
        chrome.runtime.sendMessage({
            action: 'scrapingComplete',
            totalResults: this.state.scrapedData.length,
            totalSuccess: this.state.scrapedData.filter(p => p?.scrapeStatus === 'success').length,
            totalErrors: this.state.errors.length,
            partialScrape: isPartial,
            ...(error && { error })
        });

        // Handle download button state
        if (this.state.scrapedData.length > 0) {
            chrome.runtime.sendMessage({ action: 'enableDownload' });
        } else {
            chrome.runtime.sendMessage({ action: 'disableDownload' });
        }
    }
}
