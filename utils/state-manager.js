// Initial state structure
const initialState = {
    currentPage: 1,
    endPage: 1,
    urlCollectionComplete: false,
    propertyUrls: [],
    scrapedData: [],
    currentBatchIndex: 0,
    batchSize: 60,
    originalPageUrl: '',
    errors: [],
    lastUrlCollectionTime: null
};

export class StateManager {
    constructor() {
        this.state = { ...initialState };
    }

    // Load state from storage
    async loadState() {
        try {
            const data = await chrome.storage.local.get('scrapingState');

            if (data.scrapingState) {
                if (this._isValidState(data.scrapingState)) {
                    this.state = {
                        ...this.state,
                        ...data.scrapingState
                    };

                    // Clean up undefined items
                    this.state.scrapedData = this.state.scrapedData.filter(Boolean);
                    console.log(`Loaded state with ${this.state.propertyUrls.length} URLs and ${this.state.scrapedData.length} items`);
                } else {
                    console.warn('Invalid state structure found, using fresh state');
                    await this.resetState();
                }
            }
        } catch (error) {
            console.error('Error loading state:', error);
            await this.resetState();
        }
    }

    // Save current state to storage
    async saveState() {
        try {
            await chrome.storage.local.set({ scrapingState: this.state });
            return true;
        } catch (error) {
            console.error('Error saving state:', error);
            return false;
        }
    }

    // Reset state to initial values
    async resetState(options = {}) {
        this.state = {
            ...initialState,
            ...options
        };
        await chrome.storage.local.clear();
        return this.saveState();
    }

    // Update specific state properties
    async updateState(updates) {
        Object.assign(this.state, updates);
        return this.saveState();
    }

    // Add property URLs to state
    async addPropertyUrls(urls) {
        this.state.propertyUrls = [...this.state.propertyUrls, ...urls];
        this.state.lastUrlCollectionTime = Date.now();
        return this.saveState();
    }

    // Add scraped data for a property
    async addScrapedData(index, data) {
        this.state.scrapedData[index] = {
            ...data,
            scrapedAt: new Date().toISOString()
        };
        return this.saveState();
    }

    // Add error to state
    async addError(error) {
        this.state.errors.push({
            ...error,
            timestamp: new Date().toISOString()
        });
        return this.saveState();
    }

    // Get state statistics
    getStatistics() {
        return {
            totalUrls: this.state.propertyUrls.length,
            scrapedCount: this.state.scrapedData.filter(Boolean).length,
            successCount: this.state.scrapedData.filter(d => d?.scrapeStatus === 'success').length,
            errorCount: this.state.errors.length,
            progress: {
                current: this.state.currentPage,
                total: this.state.endPage
            }
        };
    }

    // Get batch information
    getBatchInfo() {
        const startIdx = this.state.currentBatchIndex * this.state.batchSize;
        const endIdx = Math.min(startIdx + this.state.batchSize, this.state.propertyUrls.length);

        return {
            startIndex: startIdx,
            endIndex: endIdx,
            currentBatch: this.state.currentBatchIndex + 1,
            totalBatches: Math.ceil(this.state.propertyUrls.length / this.state.batchSize),
            items: this.state.propertyUrls.slice(startIdx, endIdx)
        };
    }

    // Check if state is valid
    _isValidState(state) {
        return state &&
            Array.isArray(state.propertyUrls) &&
            Array.isArray(state.scrapedData) &&
            Array.isArray(state.errors) &&
            typeof state.currentPage === 'number' &&
            typeof state.endPage === 'number';
    }

    // Clean up invalid data
    async cleanupState() {
        // Remove undefined/null entries
        this.state.scrapedData = this.state.scrapedData.filter(Boolean);

        // Remove duplicate URLs
        const uniqueUrls = new Set();
        this.state.propertyUrls = this.state.propertyUrls.filter(item => {
            const url = typeof item === 'string' ? item : item?.url;
            if (!url || uniqueUrls.has(url)) return false;
            uniqueUrls.add(url);
            return true;
        });

        return this.saveState();
    }

    // Get data for CSV export
    getExportData() {
        return {
            urls: this.state.propertyUrls,
            scrapedData: this.state.scrapedData.filter(Boolean),
            statistics: this.getStatistics()
        };
    }
}
