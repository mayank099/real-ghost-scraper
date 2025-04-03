// Global variables to store scraping state
let isProcessing = false;
let tabId;
let baseUrl;
let delay;

// Scraping state object
const state = {
    currentPage: 1,
    endPage: 1,
    urlCollectionComplete: false,
    propertyUrls: [],
    scrapedData: [],
    currentBatchIndex: 0,
    batchSize: 60,
    originalPageUrl: '',
    errors: []
};

// Function to save state to chrome.storage
async function saveState() {
    await chrome.storage.local.set({ scrapingState: state });
}

// Function to load state from chrome.storage
async function loadState() {
    const data = await chrome.storage.local.get('scrapingState');
    if (data.scrapingState) {
        Object.assign(state, data.scrapingState);
    }
}

// Function to clear cookies and session data for realestate.com.au
async function clearCookies() {
    console.log('Clearing cookies and session data to avoid rate limiting...');

    // Common cookies to clear
    const cookieNames = ['_gcl_au', '_gid', '_ga', 'AMCVS_', 'AMCV_', 's_cc', 's_sq',
        'mbox', 'RT', '_fbp', 'reauid', 'reauids', 'visid_incap', 'incap_ses',
        'nlbi_', 'utag_main', '__gads', 'IDE', '_gat'];

    // Clear known cookies one by one
    for (const name of cookieNames) {
        try {
            await chrome.cookies.remove({
                url: 'https://www.realestate.com.au',
                name: name
            });
        } catch (error) {
            // Ignore errors for cookies that don't exist
            console.log(`Cookie ${name} not found or could not be removed`);
        }
    }

    // Get all cookies for the domain and clear remaining ones
    try {
        const cookies = await chrome.cookies.getAll({ domain: 'realestate.com.au' });
        console.log(`Found ${cookies.length} additional cookies to clear`);

        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: `https://www.realestate.com.au${cookie.path}`,
                name: cookie.name
            });
        }

        console.log('Cookies cleared successfully');
    } catch (error) {
        console.error('Error clearing all cookies:', error);
    }

    // Add a random delay to vary request patterns
    const randomDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 second random delay
    console.log(`Adding random delay of ${randomDelay}ms to avoid detection`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
}

// Set up a periodic check to ensure scraping progress
let lastProgressCheck = 0;
let lastProcessedCount = 0;
const progressCheckInterval = 5 * 60 * 1000; // 5 minutes

function checkScrapingProgress() {
    // Only run if scraping is active
    if (!isProcessing) return;
    
    console.log('Running periodic progress check...');
    
    const now = Date.now();
    // Check if we've been stuck in URL collection for too long (more than 10 minutes)
    if (!state.urlCollectionComplete && state.lastUrlCollectionTime && 
        (now - state.lastUrlCollectionTime > 10 * 60 * 1000)) {
        
        console.log('URL collection seems stuck. Resuming from current page...');
        collectAllPropertyUrls();
    }
    
    // Check if property detail scraping is stuck (no new properties in 10 minutes)
    const currentProcessed = state.scrapedData.filter(item => item !== undefined).length;
    if (state.urlCollectionComplete && currentProcessed === lastProcessedCount && 
        (now - lastProgressCheck > 10 * 60 * 1000)) {
        
        console.log('Property detail scraping seems stuck. Attempting to continue...');
        // Clear cookies and try to continue with next batch
        clearCookies().then(() => {
            // Move to next batch if we've been stuck
            if (state.propertyUrls.length > 0) {
                state.currentBatchIndex++;
                saveState().then(() => {
                    processBatch();
                });
            }
        });
    }
    
    // Update our tracking variables
    lastProgressCheck = now;
    lastProcessedCount = currentProcessed;
}

// Start the periodic check
setInterval(checkScrapingProgress, progressCheckInterval);

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message);

    // Start scraping process
    if (message.action === 'startScraping') {
        // Reset state object
        state.currentPage = message.startPage;
        state.endPage = message.endPage;
        state.urlCollectionComplete = false;
        state.propertyUrls = [];
        state.scrapedData = [];
        state.errors = [];
        state.currentBatchIndex = 0;

        // Set other parameters
        delay = message.delay;
        isProcessing = true;

        if (message.tabId) {
            tabId = message.tabId;
            state.originalPageUrl = message.url;
        }

        // Clear storage and start scraping
        chrome.storage.local.clear(() => {
            saveState().then(() => {
                startScrapingProcess().catch(error => {
                    console.error('Error in startScraping:', error);
                    chrome.runtime.sendMessage({
                        action: 'scrapingError',
                        error: error.message
                    });
                });
            });
        });

        // Send an immediate response
        sendResponse({ status: "Starting scraping process" });
        return true; // Keep the message channel open
    }

    // Handle collected URLs from listing page
    else if (message.action === 'urlsCollected') {
        console.log(`Received ${message.urls.length} URLs from page ${message.pageNumber}`);
        handleUrlCollection(message).catch(console.error);
        sendResponse({ status: "Processing URLs" });
        return true; // Keep message channel open
    }

    // Handle details scraped from a property detail page
    else if (message.action === 'propertyDetailsScraped') {
        console.log('Received property details:', message.details);

        // Log key properties to verify data
        if (message.details) {
            console.log(`Property data received: 
                Address: ${message.details.address || 'None'}, 
                Beds: ${message.details.bedrooms || 'None'}, 
                Baths: ${message.details.bathrooms || 'None'}, 
                Cars: ${message.details.carspaces || 'None'},
                Type: ${message.details.propertyType || 'None'},
                Image: ${message.details.mainImage ? 'Yes' : 'No'}`
            );
        }

        // Process the details immediately instead of deferring
        try {
            // Get current property index
            const currentIndex = state.currentBatchIndex * state.batchSize;
            const batchPosition = currentIndex % state.batchSize;

            if (!state.propertyUrls[currentIndex]) {
                console.error(`No property URL found at index ${currentIndex}`);
                sendResponse({ status: "Error processing property details - invalid index" });
                return true;
            }

            // Get the actual URL string
            const propertyUrl = typeof state.propertyUrls[currentIndex] === 'string'
                ? state.propertyUrls[currentIndex]
                : state.propertyUrls[currentIndex].url;

            // Store the scraped data
            state.scrapedData[currentIndex] = {
                url: propertyUrl,
                address: message.details?.address || '',
                price: message.details?.price || '',
                description: message.details?.description || '',
                bedrooms: message.details?.bedrooms || '',
                bathrooms: message.details?.bathrooms || '',
                carspaces: message.details?.carspaces || '',
                propertyType: message.details?.propertyType || '',
                agent: message.details?.agent || '',
                mainImage: message.details?.mainImage || '',
                features: message.details?.features || {},
                scrapeStatus: 'success',
                scrapedAt: new Date().toISOString()
            };

            // Log the save operation
            console.log(`Saved property #${currentIndex} to state:`, state.scrapedData[currentIndex]);

            // Save state
            saveState().then(() => {
                // Send progress update
                chrome.runtime.sendMessage({
                    action: 'detailProgress',
                    current: batchPosition + 1,
                    total: Math.min(state.batchSize, state.propertyUrls.length - (state.currentBatchIndex * state.batchSize)),
                    currentBatch: state.currentBatchIndex + 1,
                    totalBatches: Math.ceil(state.propertyUrls.length / state.batchSize),
                    propertyAddress: state.scrapedData[currentIndex].address || propertyUrl,
                    overallProgress: {
                        current: currentIndex + 1,
                        total: state.propertyUrls.length
                    }
                });

                // If this is the last property in the batch, process the next batch
                const endIdx = Math.min((state.currentBatchIndex + 1) * state.batchSize, state.propertyUrls.length);
                if (currentIndex === endIdx - 1) {
                    state.currentBatchIndex++;
                    saveState().then(() => {
                        setTimeout(() => {
                            processBatch();
                        }, delay);
                    });
                }
            });

            sendResponse({ status: "Property details saved successfully" });
        } catch (error) {
            console.error("Error handling property details:", error);
            sendResponse({ status: "Error processing property details" });
        }

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
        // Stop the scraping process
        isProcessing = false;

        console.log('Stopping scraping process. Preserving collected data...');

        // Keep all data we've collected so far
        // Filter out only undefined entries
        const validScrapedData = state.scrapedData.filter(item => item !== undefined);

        console.log(`Found ${validScrapedData.length} scraped records to preserve`);

        // Replace the state.scrapedData with only the valid entries
        state.scrapedData = validScrapedData;

        // Save state to ensure all data is preserved
        saveState().then(() => {
            // If we're in the middle of processing, return to original page
            if (tabId) {
                chrome.tabs.update(tabId, { url: state.originalPageUrl });
            }

            // First send UI reset to clear any progress indicators
            chrome.runtime.sendMessage({
                action: 'resetUI'
            });

            // Then send completion message with partial results
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                totalResults: state.scrapedData.length,
                totalSuccess: state.scrapedData.filter(p => p && p.scrapeStatus === 'success').length,
                totalErrors: state.errors.length,
                partialScrape: true
            });

            // Only enable download if we have valid data
            if (state.scrapedData.length > 0) {
                chrome.runtime.sendMessage({
                    action: 'enableDownload'
                });
            } else {
                chrome.runtime.sendMessage({
                    action: 'disableDownload'
                });
            }
        });

        // Send an immediate response
        sendResponse({ status: "Stopped scraping process" });
        return true; // Keep message channel open
    }

    // Handle request for scraping status
    else if (message.action === 'getScrapingStatus') {
        // Calculate current progress if applicable
        let progress = null;
        if (isProcessing && state.propertyUrls.length > 0) {
            // Get current property index
            const currentIndex = state.currentBatchIndex * state.batchSize;
            progress = {
                current: currentIndex + 1,
                total: state.propertyUrls.length
            };
        }

        // Send back current status
        sendResponse({
            isProcessing: isProcessing,
            hasData: state.scrapedData && state.scrapedData.length > 0,
            progress: progress
        });
        return true; // Keep message channel open
    }

    // Keep message channel open for all messages
    return true;
});

// This function is no longer used - we process details directly in the message handler
// Keeping as reference but it's been replaced
async function handlePropertyDetails(message) {
    // This function has been replaced by inline processing in the message handler
    console.log('Legacy handlePropertyDetails called but no longer used');
}

// Function to handle URL collection asynchronously
async function handleUrlCollection(message) {
    try {
        if (!message.urls || !Array.isArray(message.urls)) {
            throw new Error('Invalid URL data received');
        }

        // Add URLs to the collection with proper structure
        const formattedUrls = message.urls
            .filter(url => url && typeof url === 'string' && url.includes('realestate.com.au'))
            .map(url => ({
                url: url.trim(),
                scrapeAttempts: 0,
                addedAt: new Date().toISOString()
            }));

        if (formattedUrls.length === 0) {
            console.warn(`No valid URLs found on page ${message.pageNumber}`);
        }

        // Add the formatted URLs to our collection
        state.propertyUrls = [...state.propertyUrls, ...formattedUrls];

        // Set a timestamp to track when URLs were last collected
        state.lastUrlCollectionTime = Date.now();

        // Send progress update to popup
        chrome.runtime.sendMessage({
            action: 'urlCollectionProgress',
            currentPage: message.pageNumber,
            totalPages: state.endPage,
            newUrls: formattedUrls.length,
            totalUrls: state.propertyUrls.length,
            pageSuccess: formattedUrls.length > 0
        });

        // Save state before proceeding
        await saveState();

        // Determine next action
        if (message.pageNumber < state.endPage) {
            // Move to next page
            state.currentPage++;
            await saveState();

            // Add delay before next page
            await new Promise(resolve => setTimeout(resolve, delay));
            await collectAllPropertyUrls();
        } else {
            // URL collection complete
            console.log('URL collection complete. Total URLs:', state.propertyUrls.length);
            state.urlCollectionComplete = true;
            state.currentBatchIndex = 0;
            await saveState();

            if (state.propertyUrls.length === 0) {
                throw new Error('No valid property URLs were collected');
            }

            // Start processing the first batch
            processBatch();
        }
    } catch (error) {
        console.error('Error handling URL collection:', error);
        state.errors.push({
            phase: 'url_collection',
            page: message.pageNumber,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        await saveState();

        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: `Error collecting URLs: ${error.message}`
        });

        // If this is a critical error, we might want to stop the process
        if (error.message.includes('No valid property URLs')) {
            isProcessing = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                totalResults: state.propertyUrls.length,
                totalErrors: state.errors.length,
                error: error.message
            });
        }
    }
}

// Function to start the scraping process
async function startScrapingProcess() {
    try {
        // Load previous state if exists
        await loadState();

        // Reset state if starting fresh
        if (!state.urlCollectionComplete) {
            state.propertyUrls = [];
            state.scrapedData = [];
            state.errors = [];
            state.currentBatchIndex = 0;
        }

        // Get current active tab if not already set
        if (!tabId) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) {
                throw new Error('No active tab found. Please open realestate.com.au.');
            }

            // Get current tab
            const tab = tabs[0];
            tabId = tab.id;
            state.originalPageUrl = tab.url;

            // Check if we're on the right website
            if (!tab.url.includes('realestate.com.au')) {
                throw new Error('Please navigate to realestate.com.au first.');
            }

            // Extract the base URL while preserving query parameters
            baseUrl = extractBaseUrl(tab.url);
        } else {
            baseUrl = extractBaseUrl(state.originalPageUrl);
        }

        console.log('Extracted base URL:', baseUrl);

        // If URL collection is not complete, start collecting URLs
        if (!state.urlCollectionComplete) {
            await collectAllPropertyUrls();
        } else {
            // If URLs are collected, continue with detail page scraping
            await processBatch();
        }

        await saveState();
    } catch (error) {
        console.error('Error in startScrapingProcess:', error);
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: error.message
        });
    }
}

// Function to collect all property URLs from listing pages
async function collectAllPropertyUrls() {
    console.log('Starting URL collection...');
    chrome.runtime.sendMessage({
        action: 'statusUpdate',
        message: `Collecting URLs from page ${state.currentPage}...`
    });

    await loadPageAndCollectUrls(state.currentPage);
}

// Function to load a page and collect property URLs
async function loadPageAndCollectUrls(pageNumber) {
    if (!isProcessing) return;

    const url = constructPageUrl(baseUrl, pageNumber);
    console.log(`Loading page for URL collection: ${url}`);

    try {
        // Navigate to the page
        await chrome.tabs.update(tabId, { url });

        // Wait for page load
        await new Promise((resolve, reject) => {
            let timeoutId;

            function onPageLoad(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onPageLoad);
                    clearTimeout(timeoutId);

                    // Add a delay before scraping to ensure dynamic content loads
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, {
                            action: 'scrape',
                            collectUrlsOnly: true,
                            pageNumber: pageNumber
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error('Failed to communicate with content script'));
                            } else {
                                resolve(response);
                            }
                        });
                    }, 2000);
                }
            }

            // Set up timeout
            timeoutId = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(onPageLoad);
                reject(new Error('Page load timeout'));
            }, 30000); // 30 second timeout

            chrome.tabs.onUpdated.addListener(onPageLoad);
        });

        await saveState();
    } catch (error) {
        console.error('Error in loadPageAndCollectUrls:', error);
        state.errors.push({
            page: pageNumber,
            url: url,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        await saveState();

        // Retry once on failure
        if (!error.message.includes('retry')) {
            console.log(`Retrying page ${pageNumber}...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await loadPageAndCollectUrls(pageNumber);
        }
    }
}

// Function to process property details in batches
async function processBatch() {
    if (!isProcessing) return;

    console.log(`Processing batch ${state.currentBatchIndex + 1}...`);

    const startIdx = state.currentBatchIndex * state.batchSize;
    const endIdx = Math.min(startIdx + state.batchSize, state.propertyUrls.length);
    const currentBatch = state.propertyUrls.slice(startIdx, endIdx);

    if (currentBatch.length === 0) {
        console.log('All properties processed');
        isProcessing = false;
        // Return to original page and notify completion
        chrome.tabs.update(tabId, { url: state.originalPageUrl });

        // Always make sure we have at least the URLs in scrapedData
        if (state.scrapedData.length === 0 && state.propertyUrls.length > 0) {
            state.scrapedData = state.propertyUrls.map(property => {
                const url = typeof property === 'string' ? property : property.url;
                return {
                    url: url || '',
                    address: '',
                    scrapeStatus: 'pending',
                    scrapedAt: new Date().toISOString()
                };
            });
            await saveState();
        }

        // Notify completion and always enable download if we have any data
        chrome.runtime.sendMessage({
            action: 'scrapingComplete',
            totalResults: state.scrapedData.length,
            totalSuccess: state.scrapedData.filter(p => p && p.scrapeStatus === 'success').length,
            totalErrors: state.errors.length
        });

        // Explicitly enable download button
        chrome.runtime.sendMessage({
            action: 'enableDownload'
        });
        return;
    }

    try {
        // Clear cookies before starting new batch
        await clearCookies();

        // Process each property in the batch
        for (let i = 0; i < currentBatch.length && isProcessing; i++) {
            const property = currentBatch[i];

            // Skip if property is invalid
            if (!property || (typeof property !== 'string' && !property.url)) {
                console.error(`Invalid property at index ${startIdx + i}`);
                continue;
            }

            try {
                await scrapePropertyDetails(property, startIdx + i);
            } catch (error) {
                console.error(`Failed to scrape property at index ${startIdx + i}:`, error);
                state.errors.push({
                    propertyIndex: startIdx + i,
                    url: typeof property === 'string' ? property : property.url,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                await saveState();
            }

            // Add small delay between properties
            if (i < currentBatch.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Move to next batch
        state.currentBatchIndex++;
        await saveState();

        // Add longer batch pause to avoid rate limiting
        const batchPause = delay + (Math.random() * 5000);
        console.log(`Waiting ${Math.round(batchPause / 1000)} seconds before next batch to avoid rate limiting...`);

        // Update UI
        chrome.runtime.sendMessage({
            action: 'statusUpdate',
            message: `Completed batch. Waiting ${Math.round(batchPause / 1000)} seconds before next batch...`
        });

        // Continue with next batch
        setTimeout(() => {
            processBatch();
        }, batchPause);
    } catch (error) {
        console.error('Error in processBatch:', error);
        state.errors.push({
            batch: state.currentBatchIndex,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        await saveState();
    }
}

// Function to scrape details from a property page
async function scrapePropertyDetails(property, index, retryCount = 0) {
    if (!isProcessing) return;

    console.log(`Scraping details for property ${index + 1}...${retryCount > 0 ? ` (Retry #${retryCount})` : ''}`);

    // Update the progress immediately
    chrome.runtime.sendMessage({
        action: 'detailProgress',
        current: (index % state.batchSize) + 1,
        total: Math.min(state.batchSize, state.propertyUrls.length - (state.currentBatchIndex * state.batchSize)),
        currentBatch: state.currentBatchIndex + 1,
        totalBatches: Math.ceil(state.propertyUrls.length / state.batchSize),
        propertyAddress: typeof property === 'object' ? property.address || property.url : property,
        overallProgress: {
            current: index + 1,
            total: state.propertyUrls.length
        }
    });

    try {
        // Get the URL from the property object or string
        const propertyUrl = typeof property === 'string' ? property : property.url;
        if (!propertyUrl) {
            throw new Error('Invalid property URL');
        }

        console.log(`Navigating to property URL: ${propertyUrl}`);

        // If this is a retry, clear cookies and wait longer
        if (retryCount > 0) {
            console.log(`Retry attempt #${retryCount} - clearing cookies and adding longer delay`);
            await clearCookies();

            // Add increasing delay for each retry
            const backoffDelay = retryCount * 15000; // 15 seconds, 30 seconds, 45 seconds...
            console.log(`Adding backoff delay of ${backoffDelay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }

        // Navigate to the property page
        await chrome.tabs.update(tabId, { url: propertyUrl });

        // Initialize with URL and wait for content script to fetch and return full details
        state.scrapedData[index] = {
            url: propertyUrl,
            scrapeStatus: 'pending',
            scrapedAt: new Date().toISOString()
        };

        // Save state early to ensure URLs are retained
        await saveState();

        // Wait for page load and scrape details
        const details = await new Promise((resolve, reject) => {
            let timeoutId;

            function onPageLoad(updatedTabId, changeInfo, tab) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    // Check for rate limiting in URL or title
                    if (tab && (
                        tab.url.includes('/429') ||
                        tab.url.includes('rate-limited') ||
                        tab.url.includes('too-many-requests') ||
                        (tab.title && (
                            tab.title.includes('429') ||
                            tab.title.includes('Too Many Requests') ||
                            tab.title.includes('Rate Limited')
                        ))
                    )) {
                        chrome.tabs.onUpdated.removeListener(onPageLoad);
                        clearTimeout(timeoutId);
                        console.log('RATE LIMIT DETECTED: Server returned HTTP 429 Too Many Requests');
                        reject(new Error('Rate limit detected (HTTP 429)'));
                        return;
                    }

                    chrome.tabs.onUpdated.removeListener(onPageLoad);
                    clearTimeout(timeoutId);

                    // Wait for page content to load and be accessible
                    setTimeout(() => {
                        // First check if the page content contains rate limiting messages
                        chrome.tabs.executeScript(tabId, {
                            code: `
                                const bodyText = document.body.innerText.toLowerCase();
                                bodyText.includes('429') || 
                                bodyText.includes('too many requests') || 
                                bodyText.includes('rate limit') || 
                                bodyText.includes('blocked') ||
                                bodyText.includes('try again later') ||
                                document.querySelector('.error-page')
                            `
                        }, (results) => {
                            if (chrome.runtime.lastError) {
                                // If executeScript fails, proceed with scraping attempt
                                console.log('Could not check for rate limiting, proceeding with scrape');
                                proceedWithScraping();
                                return;
                            }

                            if (results && results[0] === true) {
                                console.log('RATE LIMIT DETECTED: Content contains rate limiting messages');
                                reject(new Error('Rate limit detected in page content'));
                                return;
                            }

                            proceedWithScraping();
                        });

                        function proceedWithScraping() {
                            console.log('Attempting to scrape property details...');
                            
                            // Try to directly send a message to the content script
                            console.log('Attempting to send message to content script...');
                            
                            let messageSent = false;
                            chrome.tabs.sendMessage(tabId, {
                                action: 'scrape',
                                isDetailPage: true,
                                propertyIndex: index
                            }, (response) => {
                                messageSent = true;
                                if (chrome.runtime.lastError) {
                                    console.error('Error communicating with content script:', chrome.runtime.lastError);
                                    // Try fallback scraping
                                    fallbackDirectScraping();
                                } else if (!response || response.error) {
                                    reject(new Error(response?.error || 'Failed to extract property details'));
                                } else {
                                    console.log('Successfully received response from content script');
                                    resolve(response);
                                }
                            });
                            
                            // Set a timeout to check if the message was sent
                            setTimeout(() => {
                                if (!messageSent) {
                                    console.error('Message send timed out - content script may not be responding');
                                    fallbackDirectScraping();
                                }
                            }, 5000);
                            
                            // Fallback function to extract data directly if content script fails
                            function fallbackDirectScraping() {
                                console.log('Using fallback direct scraping method...');
                                
                                chrome.tabs.executeScript(tabId, {
                                    code: `
                                    // Basic property extraction
                                    (() => {
                                        try {
                                            const details = {};
                                            
                                            // Extract address
                                            const addressEl = document.querySelector('.property-info-address, h1[class*="address"], [data-testid*="address"]');
                                            details.address = addressEl ? addressEl.textContent.trim() : '';
                                            
                                            // Extract price
                                            const priceEl = document.querySelector('.property-price, .property-info__price, [class*="price"], [class*="Price"]');
                                            details.price = priceEl ? priceEl.textContent.trim() : '';
                                            
                                            // Extract basic features
                                            const featureText = document.body.textContent;
                                            const bedMatch = featureText.match(/(\\d+)\\s*bed/i);
                                            details.bedrooms = bedMatch ? bedMatch[1] : '';
                                            
                                            const bathMatch = featureText.match(/(\\d+)\\s*bath/i);
                                            details.bathrooms = bathMatch ? bathMatch[1] : '';
                                            
                                            const carMatch = featureText.match(/(\\d+)\\s*car/i);
                                            details.carspaces = carMatch ? carMatch[1] : '';
                                            
                                            // Get property type from URL or content
                                            const urlMatch = window.location.href.match(/property-(house|unit|apartment|townhouse|land)/i);
                                            details.propertyType = urlMatch ? urlMatch[1] : '';
                                            
                                            // Get URL
                                            details.url = window.location.href;
                                            
                                            return details;
                                        } catch (error) {
                                            return { 
                                                error: 'Fallback scraping failed: ' + error.message,
                                                url: window.location.href
                                            };
                                        }
                                    })();
                                    `
                                }, (results) => {
                                    if (chrome.runtime.lastError || !results || !results[0]) {
                                        reject(new Error('Both content script and fallback scraping failed'));
                                    } else {
                                        const details = results[0];
                                        if (details.error) {
                                            reject(new Error(details.error));
                                        } else {
                                            resolve(details);
                                        }
                                    }
                                });
                            }
                        }
                    }, 3000); // Increased timeout for reliable page loading
                }
            }

            // Set timeout for page load
            timeoutId = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(onPageLoad);
                reject(new Error('Page load timeout'));
            }, 30000); // 30 second timeout

            chrome.tabs.onUpdated.addListener(onPageLoad);
        });

        // Log the scraped details
        console.log(`Received details for property at index ${index}:`, details);

        // Update the scraped data with full details
        state.scrapedData[index] = {
            url: propertyUrl,
            address: details?.address || '',
            price: details?.price || '',
            description: details?.description || '',
            bedrooms: details?.bedrooms || '',
            bathrooms: details?.bathrooms || '',
            carspaces: details?.carspaces || '',
            propertyType: details?.propertyType || '',
            agent: details?.agent || '',
            mainImage: details?.mainImage || '',
            features: details?.features || {},
            scrapeStatus: 'success',
            scrapedAt: new Date().toISOString()
        };

        // Log the property details for debugging
        console.log(`Successfully scraped property at index ${index}:`, state.scrapedData[index]);

        await saveState();
    } catch (error) {
        console.error(`Error scraping property ${index + 1}:`, error);

        // Check if this is a rate limiting error
        const isRateLimit = error.message.toLowerCase().includes('rate limit') ||
            error.message.includes('429') ||
            error.message.toLowerCase().includes('too many requests');

        // If rate limited and we haven't exceeded max retries, retry with exponential backoff
        if (isRateLimit && retryCount < 3) {
            console.log(`Detected rate limiting (429). Will retry property ${index + 1} after backoff...`);

            // Save current state before retry
            await saveState();

            // Clear all cookies to help avoid rate limiting
            await clearCookies();

            // Wait a longer time based on retry count (exponential backoff)
            const waitTime = (Math.pow(2, retryCount) * 30000) + (Math.random() * 10000); // 30s, 60s, 120s + random
            console.log(`Waiting ${Math.round(waitTime / 1000)} seconds before retry #${retryCount + 1}...`);

            // Send UI update
            chrome.runtime.sendMessage({
                action: 'statusUpdate',
                message: `Rate limit detected. Waiting ${Math.round(waitTime / 1000)} seconds before retry...`
            });

            await new Promise(resolve => setTimeout(resolve, waitTime));

            // Try again with increased retry count
            return await scrapePropertyDetails(property, index, retryCount + 1);
        }

        // Get the actual URL for storing in error state
        const propertyUrl = typeof property === 'string' ? property : property.url || '';

        // Store basic data even on error
        state.scrapedData[index] = {
            url: propertyUrl,
            address: typeof property === 'object' ? property.address || '' : '',
            price: typeof property === 'object' ? property.price || '' : '',
            description: typeof property === 'object' ? property.description || '' : '',
            bedrooms: typeof property === 'object' ? property.bedrooms || '' : '',
            bathrooms: typeof property === 'object' ? property.bathrooms || '' : '',
            carspaces: typeof property === 'object' ? property.carspaces || '' : '',
            propertyType: typeof property === 'object' ? property.propertyType || '' : '',
            agent: typeof property === 'object' ? property.agent || '' : '',
            mainImage: typeof property === 'object' ? property.mainImage || '' : '',
            scrapeStatus: 'error',
            error: error.message,
            scrapeAttempts: (typeof property === 'object' && property.scrapeAttempts) ? property.scrapeAttempts + 1 : 1,
            lastAttempt: new Date().toISOString()
        };

        state.errors.push({
            propertyIndex: index,
            url: typeof property === 'object' ? property.url : propertyUrl,
            error: error.message,
            timestamp: new Date().toISOString()
        });

        await saveState();
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
    try {
        // If baseUrl is an object with basePath and search properties
        if (baseUrl && typeof baseUrl === 'object' && baseUrl.basePath) {
            return `${baseUrl.basePath}/list-${pageNumber}${baseUrl.search}`;
        }

        // If it's a string URL
        const urlString = typeof baseUrl === 'string' ? baseUrl : baseUrl?.url || '';
        if (!urlString) {
            throw new Error('Invalid URL format');
        }

        // Parse the URL
        const urlObj = new URL(urlString);
        const path = urlObj.pathname.replace(/\/list-\d+/, '');

        // Reconstruct the URL
        return `${urlObj.protocol}//${urlObj.host}${path}/list-${pageNumber}${urlObj.search}`;
    } catch (error) {
        console.error('Error constructing page URL:', error);
        throw new Error(`Failed to construct page URL: ${error.message}`);
    }
}

// Function to generate and download the CSV file
function generateCSV() {
    console.log('Preparing CSV generation...');
    console.log(`Raw scraped data length: ${state.scrapedData.length}`);

    // Include ALL data, even if it's empty or has errors
    let validScrapedData = [];

    // First, collect all valid entries and check what we have
    const filteredData = state.scrapedData.filter(item => item !== undefined);
    console.log(`Found ${filteredData.length} valid items in scraped data`);

    // If array is empty, try to use property URLs directly
    if (filteredData.length === 0) {
        // Create basic entries from property URLs
        validScrapedData = state.propertyUrls.map(property => {
            const url = typeof property === 'string' ? property : property.url;
            return {
                url: url || '',
                address: '',
                scrapeStatus: 'pending',
                scrapedAt: new Date().toISOString()
            };
        });
    } else {
        // Use the filtered data, but ensure all collected URLs are represented
        validScrapedData = [...filteredData];

        // Create a map of URLs already in the data
        const urlMap = new Map();
        validScrapedData.forEach(item => {
            if (item && item.url) {
                urlMap.set(item.url, true);
            }
        });

        // Add any property URLs that are missing from the data
        if (state.propertyUrls && state.propertyUrls.length > 0) {
            state.propertyUrls.forEach((property, index) => {
                const url = typeof property === 'string' ? property : property.url;
                if (url && !urlMap.has(url)) {
                    console.log(`Adding missing property URL: ${url}`);
                    // Add this URL to our data with placeholder info
                    validScrapedData.push({
                        url: url,
                        address: '',
                        scrapeStatus: 'not_scraped',
                        error: 'Property URL was not processed',
                        scrapedAt: new Date().toISOString()
                    });
                }
            });
        }
    }

    console.log(`Preparing CSV data: ${validScrapedData.length} entries`);

    if (validScrapedData.length === 0) {
        console.log('No properties to export');
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: 'No results to download. Please scrape some properties first.'
        });

        // Disable the download button since there's no data
        chrome.runtime.sendMessage({
            action: 'disableDownload'
        });
        return;
    }

    console.log(`Generating CSV file with ${validScrapedData.length} properties...`);

    try {
        // Create header row - get all possible fields
        const allFields = new Set();
        validScrapedData.forEach(property => {
            if (property) {
                Object.keys(property).forEach(key => {
                    // Don't include features object in the main columns
                    if (key !== 'features') {
                        allFields.add(key);
                    }
                });
            }
        });

        // Convert Set to Array for easier handling
        const headers = Array.from(allFields);

        // Add feature categories if present
        const allFeatureCategories = new Set();
        validScrapedData.forEach(property => {
            if (property && property.features) {
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

        // Add data rows
        validScrapedData.forEach((property, index) => {
            if (!property) return; // Skip undefined properties

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
