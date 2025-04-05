import { constructPageUrl } from './url-utils.js';
import { clearCookiesAndDelay } from './cookie-utils.js';

export class NavigationManager {
    constructor(tabId, baseUrl, delay = 2000) {
        this.tabId = tabId;
        this.baseUrl = baseUrl;
        this.delay = delay;
    }

    // Navigate to a specific URL and wait for page load
    async navigateToUrl(url) {
        return new Promise((resolve, reject) => {
            let timeoutId;

            const handlePageLoad = (updatedTabId, changeInfo, tab) => {
                if (updatedTabId === this.tabId && changeInfo.status === 'complete') {
                    cleanup();
                    setTimeout(resolve, 2000); // Wait for dynamic content
                }
            };

            const cleanup = () => {
                chrome.tabs.onUpdated.removeListener(handlePageLoad);
                clearTimeout(timeoutId);
            };

            // Set timeout for navigation
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Navigation timeout'));
            }, 30000);

            // Add listener for page load
            chrome.tabs.onUpdated.addListener(handlePageLoad);

            // Start navigation
            chrome.tabs.update(this.tabId, { url }).catch(error => {
                cleanup();
                reject(error);
            });
        });
    }

    // Load page and collect URLs
    async loadPageAndCollectUrls(pageNumber) {
        try {
            const url = constructPageUrl(this.baseUrl, pageNumber);
            console.log(`Loading page for URL collection: ${url}`);

            // Navigate to the page
            await this.navigateToUrl(url);

            // Collect URLs from the page
            return await this.collectUrlsFromPage(pageNumber);
        } catch (error) {
            console.error('Error loading page:', error);
            throw error;
        }
    }

    // Collect URLs from the current page
    async collectUrlsFromPage(pageNumber) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(this.tabId, {
                action: 'scrape',
                collectUrlsOnly: true,
                pageNumber: pageNumber
            }, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error('Failed to communicate with content script'));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Navigate through batch of property pages
    async processBatchNavigation(properties, options = {}) {
        const { onBeforeNavigate, onAfterNavigate, onError } = options;

        for (const property of properties) {
            try {
                if (onBeforeNavigate) {
                    await onBeforeNavigate(property);
                }

                await clearCookiesAndDelay();
                await this.navigateToUrl(property.url);

                if (onAfterNavigate) {
                    await onAfterNavigate(property);
                }

                // Add delay between properties
                await new Promise(resolve => setTimeout(resolve, this.delay));
            } catch (error) {
                if (onError) {
                    await onError(property, error);
                } else {
                    throw error;
                }
            }
        }
    }

    // Return to original page
    async returnToOriginalPage(url) {
        if (!url) return;

        try {
            await this.navigateToUrl(url);
        } catch (error) {
            console.error('Error returning to original page:', error);
        }
    }

    // Check for page errors
    async checkForPageErrors() {
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: this.tabId },
                func: () => {
                    const body = document.body.textContent.toLowerCase();
                    return {
                        hasError: body.includes('error') || body.includes('not found') || body.includes('404'),
                        hasRateLimit: body.includes('429') || body.includes('too many requests'),
                        isBlocked: body.includes('access denied') || body.includes('blocked')
                    };
                }
            });

            return result[0].result;
        } catch (error) {
            console.error('Error checking page status:', error);
            return { hasError: true, hasRateLimit: false, isBlocked: false };
        }
    }
}
