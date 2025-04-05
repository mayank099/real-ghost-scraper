// Scraping state management
const state = {
    currentPage: null,
    endPage: null,
    delay: null,
    baseUrl: null,
    tabId: null,
    allResults: [],
    isProcessing: false,
    originalPageUrl: '',
    visitingDetailPages: false,
    currentDetailPropertyIndex: 0
};

// Configuration
const config = {
    BATCH_SIZE: 10,
    PAGE_LOAD_DELAY: 2000,
    PROPERTY_LOAD_DELAY: 500
};

// Error handling utility
const handleError = (error, message) => {
    console.error(message, error);
    chrome.runtime.sendMessage({
        action: 'scrapingError',
        error: `${message}: ${error.message || error}`
    });
};

// Message handler for extension communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message);

    // Start scraping process
    if (message.action === 'startScraping') {
        // Initialize scraping parameters
        // Keep existing results when restarting scraping
        const existingResults = state.allResults || [];
        Object.assign(state, {
            currentPage: message.startPage,
            endPage: message.endPage,
            delay: message.delay,
            isProcessing: true,
            tabId: message.tabId || null,
            originalPageUrl: message.url || '',
            allResults: existingResults // Preserve existing results
        });

        // Start the scraping process
        startScrapingProcess();
        // Send an immediate response
        sendResponse({ status: "Starting scraping process" });
        return true; // Keep the message channel open
    }

    // Handle scraped results from listing page
    else if (message.action === 'scrapeResults') {
        console.log(`Received ${message.results.length} properties from listing page`);

        // Add results to the collection
        const newResults = message.results;
        state.allResults = [...state.allResults, ...newResults];

        // Send progress update to popup
        chrome.runtime.sendMessage({
            action: 'scrapingProgress',
            currentPage: state.currentPage,
            results: newResults,
            total: state.allResults.length
        });

        // Handle detail page scraping or continue to next page
        if (message.visitDetails && newResults.length > 0) {
            state.visitingDetailPages = true;
            state.currentDetailPropertyIndex = 0;
            setTimeout(() => visitNextPropertyDetailPage(newResults), 1000);
        } else {
            continueToNextPageOrFinish();
        }

        // Send an immediate response
        sendResponse({ status: "Received listing results" });
        return true; // Keep message channel open
    }

    // Handle details scraped from a property detail page
    else if (message.action === 'propertyDetailsScraped') {
        // Received details from a property detail page
        console.log('Received property details:', message.details);

        const currentBatch = state.allResults.slice(state.allResults.length - message.batchSize);

        if (state.currentDetailPropertyIndex < currentBatch.length) {
            // Update property details
            updatePropertyDetails(currentBatch[state.currentDetailPropertyIndex], message.details);
            state.currentDetailPropertyIndex++;

            // Handle next property or continue to listing page
            if (state.currentDetailPropertyIndex < currentBatch.length) {
                setTimeout(() => visitNextPropertyDetailPage(currentBatch), state.delay);
            } else {
                state.visitingDetailPages = false;
                setTimeout(returnToListingPage, state.delay);
            }
        }

        // Send an immediate response
        sendResponse({ status: "Received property details" });
        return true; // Keep message channel open
    }

    // Handle download CSV request
    else if (message.action === 'downloadCSV') {
        // Create and download CSV when requested
        generateCSV();
        // Send an immediate response
        sendResponse({ status: "Started CSV generation" });
        return true; // Keep message channel open
    }

    // Handle stop scraping request
    else if (message.action === 'stopScraping') {
        state.isProcessing = false;
        if (state.tabId) {
            chrome.tabs.update(state.tabId, { url: state.originalPageUrl });
        }

        // Send an immediate response
        sendResponse({ status: "Stopped scraping process" });
        return true; // Keep message channel open
    }

    // Keep message channel open for all messages
    return true;
});

// Utility functions
const updatePropertyDetails = (property, details) => {
    const fields = ['description', 'features', 'saleMethod', 'price', 'address',
        'propertyType', 'imageUrl', 'beds', 'baths', 'parking',
        'landSize', 'agent'];

    fields.forEach(field => {
        if (details[field]) {
            property[field] = details[field];
        }
    });
};

const startScrapingProcess = () => {
    state.visitingDetailPages = false;

    if (!state.tabId) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) {
                chrome.runtime.sendMessage({
                    action: 'scrapingError',
                    error: 'No active tab found. Please open realestate.com.au.'
                });
                return;
            }

            const tab = tabs[0];
            state.tabId = tab.id;
            state.originalPageUrl = tab.url;

            if (!tab.url.includes('realestate.com.au')) {
                handleError(new Error('Invalid website'), 'Please navigate to realestate.com.au first');
                return;
            }

            state.baseUrl = extractBaseUrl(tab.url);
            console.log('Extracted base URL:', state.baseUrl);
            loadPageAndScrape(state.currentPage);
        });
    } else {
        state.baseUrl = extractBaseUrl(state.originalPageUrl);
        console.log('Extracted base URL:', state.baseUrl);
        loadPageAndScrape(state.currentPage);
    }
}

// Function to extract the base URL without the list-X part
function extractBaseUrl(url) {
    try {
        // Parse the URL to separate parts
        const urlObj = new URL(url);

        // Remove list-X from the path
        const path = urlObj.pathname.replace(/\/list-\d+/, '');

        // Store the search parameters
        const search = urlObj.search;

        // Reconstruct the URL with path and search separated
        return {
            basePath: `${urlObj.protocol}//${urlObj.host}${path}`,
            search: search
        };
    } catch (error) {
        console.error("Error parsing URL:", error);
        // Fallback simple extraction
        const listIndex = url.indexOf('/list-');
        if (listIndex !== -1) {
            // Find the start of query parameters
            const queryIndex = url.indexOf('?', listIndex);
            if (queryIndex !== -1) {
                // URL has query parameters
                const basePath = url.substring(0, listIndex);
                const search = url.substring(queryIndex);
                return { basePath, search };
            } else {
                // URL has no query parameters
                return {
                    basePath: url.substring(0, listIndex),
                    search: ''
                };
            }
        }
        return { basePath: url, search: '' };
    }
}

// Function to construct the page URL correctly
function constructPageUrl(baseUrl, pageNumber) {
    // baseUrl is now an object with basePath and search
    if (typeof baseUrl === 'object' && baseUrl.basePath) {
        // Construct URL with list-X before the search parameters
        return `${baseUrl.basePath}/list-${pageNumber}${baseUrl.search}`;
    }

    // Fallback for legacy calls that might pass a string
    if (typeof baseUrl === 'string') {
        // Try to parse as URL
        try {
            const urlObj = new URL(baseUrl);
            const path = urlObj.pathname.replace(/\/list-\d+/, '');
            return `${urlObj.protocol}//${urlObj.host}${path}/list-${pageNumber}${urlObj.search}`;
        } catch (error) {
            // Simple string manipulation fallback
            const queryIndex = baseUrl.indexOf('?');
            if (queryIndex !== -1) {
                const basePath = baseUrl.substring(0, queryIndex);
                const query = baseUrl.substring(queryIndex);
                return `${basePath}/list-${pageNumber}${query}`;
            } else {
                return `${baseUrl}/list-${pageNumber}`;
            }
        }
    }

    // Ultimate fallback
    console.error("Invalid baseUrl provided:", baseUrl);
    return "";
}

const loadPageAndScrape = (pageNumber) => {
    if (!state.isProcessing) {
        console.log('Scraping process has been stopped');
        return;
    }

    const url = constructPageUrl(state.baseUrl, pageNumber);

    console.log(`Loading page for scraping: ${url}`);

    // Send update to popup
    chrome.runtime.sendMessage({
        action: 'statusUpdate',
        message: `Loading page ${pageNumber}...`
    });

    chrome.tabs.update(state.tabId, { url: url }, function (tab) {
        if (chrome.runtime.lastError) {
            console.error("Error updating tab:", chrome.runtime.lastError);
            // Preserve data and notify user on error
            handleError(chrome.runtime.lastError, 'Error navigating to page. Your data is preserved and can be downloaded.');
            state.isProcessing = false;
            return;
        }

        // Wait for the page to load, then send scrape message
        function onPageLoad(updatedTabId, changeInfo) {
            if (updatedTabId === state.tabId && changeInfo.status === 'complete') {
                // Remove the listener to avoid duplicate calls
                chrome.tabs.onUpdated.removeListener(onPageLoad);

                // Wait a moment for JS to initialize on the page
                setTimeout(() => {
                    console.log("Page loaded, sending scrape message to content script");
                    // Send message to content script to scrape the page
                    const message = {
                        action: 'scrape',
                        visitDetails: true,
                        batchSize: config.BATCH_SIZE
                    };

                    chrome.tabs.sendMessage(state.tabId, message, response => {
                        if (chrome.runtime.lastError) {
                            console.error("Error sending message to content script:", chrome.runtime.lastError);
                            setTimeout(() => chrome.tabs.sendMessage(state.tabId, message), config.PAGE_LOAD_DELAY);
                        }
                    });
                }, config.PAGE_LOAD_DELAY);
            }
        }

        chrome.tabs.onUpdated.addListener(onPageLoad);
    });
}

const visitNextPropertyDetailPage = (propertyBatch) => {
    if (!state.isProcessing) {
        console.log('Scraping process has been stopped');
        if (state.allResults.length > 0) {
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                totalResults: state.allResults.length,
                message: 'Scraping stopped. You can download the data collected so far.'
            });
        }
        return;
    }

    if (state.currentDetailPropertyIndex < propertyBatch.length) {
        const property = propertyBatch[state.currentDetailPropertyIndex];

        // Send progress update to popup
        chrome.runtime.sendMessage({
            action: 'detailProgress',
            current: state.currentDetailPropertyIndex + 1,
            total: propertyBatch.length,
            propertyAddress: property.address
        });

        if (property.url) {
            console.log(`Navigating to property detail page: ${property.url}`);

            // Navigate to the property detail page
            chrome.tabs.update(state.tabId, { url: property.url }, function (tab) {
                if (chrome.runtime.lastError) {
                    console.error("Error navigating to detail page:", chrome.runtime.lastError);
                    state.currentDetailPropertyIndex++;
                    setTimeout(() => {
                        visitNextPropertyDetailPage(propertyBatch);
                    }, config.PROPERTY_LOAD_DELAY);
                    return;
                }

                // Wait for the page to load, then scrape
                function onDetailPageLoad(updatedTabId, changeInfo) {
                    if (updatedTabId === state.tabId && changeInfo.status === 'complete') {
                        // Remove the listener to avoid duplicate calls
                        chrome.tabs.onUpdated.removeListener(onDetailPageLoad);

                        // Wait a moment for the page to fully render
                        setTimeout(() => {
                            console.log("Detail page loaded, sending scrape message");
                            // Send message to content script to scrape the detail page
                            chrome.tabs.sendMessage(state.tabId, {
                                action: 'scrape',
                                isDetailPage: true,
                                batchSize: propertyBatch.length
                            }, function (response) {
                                if (chrome.runtime.lastError) {
                                    console.error("Error sending message to content script:", chrome.runtime.lastError);
                                    // Content script might not be loaded yet, retry or skip
                                    setTimeout(() => {
                                        chrome.tabs.sendMessage(state.tabId, {
                                            action: 'scrape',
                                            isDetailPage: true,
                                            batchSize: propertyBatch.length
                                        });
                                    }, config.PAGE_LOAD_DELAY);
                                }
                            });
                        }, config.PAGE_LOAD_DELAY);
                    }
                }

                chrome.tabs.onUpdated.addListener(onDetailPageLoad);
            });
        } else {
            // If no URL, skip to next property
            console.log(`No URL for property index ${state.currentDetailPropertyIndex}, skipping`);
            state.currentDetailPropertyIndex++;
            setTimeout(() => {
                visitNextPropertyDetailPage(propertyBatch);
            }, config.PROPERTY_LOAD_DELAY);
        }
    } else {
        // All properties in this batch processed
        returnToListingPage();
    }
}

const returnToListingPage = () => {
    if (!state.isProcessing) {
        console.log('Scraping process has been stopped');
        return;
    }

    const url = constructPageUrl(state.baseUrl, state.currentPage);

    console.log(`Returning to listing page: ${url}`);

    // Navigate back to the listing page
    chrome.tabs.update(state.tabId, { url: url }, function (tab) {
        if (chrome.runtime.lastError) {
            console.error("Error returning to listing page:", chrome.runtime.lastError);
            // Try to continue to next page anyway
            continueToNextPageOrFinish();
            return;
        }

        // Wait for the page to load
        function onListingPageLoad(updatedTabId, changeInfo) {
            if (updatedTabId === state.tabId && changeInfo.status === 'complete') {
                // Remove the listener to avoid duplicate calls
                chrome.tabs.onUpdated.removeListener(onListingPageLoad);

                // Wait a moment for the page to fully render
                setTimeout(() => {
                    // Continue to next page
                    continueToNextPageOrFinish();
                }, config.PAGE_LOAD_DELAY);
            }
        }

        chrome.tabs.onUpdated.addListener(onListingPageLoad);
    });
}

const continueToNextPageOrFinish = () => {
    if (state.currentPage < state.endPage) {
        state.currentPage++;
        setTimeout(() => loadPageAndScrape(state.currentPage), state.delay);
    } else {
        chrome.runtime.sendMessage({
            action: 'scrapingComplete',
            totalResults: state.allResults.length
        });
        state.isProcessing = false;
    }
};

const generateCSV = () => {
    if (state.allResults.length === 0) {
        handleError(new Error('No results'), 'No properties to export. Please scrape some properties first');
        return;
    }

    console.log('Generating CSV file...');

    try {
        const allFields = new Set();
        state.allResults.forEach(property => {
            Object.keys(property).forEach(key => {
                // Don't include features object in the main columns
                if (key !== 'features') {
                    allFields.add(key);
                }
            });
        });

        // Convert Set to Array for easier handling
        const headers = Array.from(allFields);

        // Add feature categories if present
        const allFeatureCategories = new Set();
        state.allResults.forEach(property => {
            if (property.features) {
                Object.keys(property.features).forEach(category => {
                    allFeatureCategories.add(category);
                });
            }
        });

        // Combine all headers
        let allHeaders = [...headers];
        allFeatureCategories.forEach(category => {
            allHeaders.push(`Feature: ${category}`);
        });

        // Create CSV content
        let csvContent = allHeaders.join(',') + '\n';

        state.allResults.forEach(property => {
            const row = [];

            // Add basic properties
            headers.forEach(header => {
                let value = property[header];

                // Handle special cases
                if (header === 'description' && value) {
                    // Clean description - remove line breaks and quotes
                    value = value.replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
                }

                // Handle null/undefined values
                if (value === null || value === undefined) {
                    value = '';
                }

                // Add quotes if the value contains commas or quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    row.push(`"${value}"`);
                } else {
                    row.push(value);
                }
            });

            // Add feature values
            allFeatureCategories.forEach(category => {
                let featureValue = '';
                if (property.features && property.features[category]) {
                    // Clean up feature values - remove duplicates and sort
                    const uniqueFeatures = [...new Set(property.features[category])];

                    // Filter out any values that appear to be just numbers or room counts
                    // which might be misclassified as features
                    const cleanedFeatures = uniqueFeatures.filter(feature => {
                        // Skip features that are just digits
                        if (/^\d+$/.test(feature)) return false;

                        // Skip features that look like "X bedrooms", "X bathrooms", etc.
                        if (/^\d+\s*(bed|bath|car|garage|park)/i.test(feature)) return false;

                        return true;
                    });

                    // Join all features in this category with semicolons
                    featureValue = cleanedFeatures.join('; ');

                    // Escape quotes and handle commas
                    featureValue = featureValue.replace(/"/g, '""');
                    row.push(`"${featureValue}"`);
                } else {
                    row.push('');
                }
            });

            csvContent += row.join(',') + '\n';
        });

        // Prepare the download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `realestate_properties_${timestamp}.csv`;

        // Use chrome.downloads API directly with data URL
        // Convert CSV string to a data URL
        const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                console.error("Download failed:", chrome.runtime.lastError);
                chrome.runtime.sendMessage({
                    action: 'scrapingError',
                    error: 'Failed to download CSV: ' + chrome.runtime.lastError.message
                });
            } else {
                console.log("Download started with ID:", downloadId);
                chrome.runtime.sendMessage({
                    action: 'downloadStarted',
                    filename: filename
                });
            }
        });
    } catch (error) {
        console.error("Error generating CSV:", error);
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: 'Error generating CSV: ' + error.message
        });
    }
}
