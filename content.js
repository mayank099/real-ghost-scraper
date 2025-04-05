// Import required utilities with try-catch
let extractPropertyUrls, extractPropertyDetails, waitForElement,
    detectInfiniteScroll, handleDynamicContent, detectAjaxNavigation;

try {
    const utils = await import(chrome.runtime.getURL('utils/index.js'));
    ({
        extractPropertyUrls,
        extractPropertyDetails,
        waitForElement,
        detectInfiniteScroll,
        handleDynamicContent,
        detectAjaxNavigation
    } = utils);
} catch (error) {
    console.error('Failed to import utilities:', error);
    window.postMessage({
        type: 'FROM_PAGE',
        message: {
            action: 'scrapingError',
            error: 'Content script initialization failed: ' + error.message
        }
    }, '*');
}

// Initialize content script
async function initialize() {
    try {
        // Listen for messages from the extension
        window.addEventListener('message', (event) => {
            // Only accept messages from the same window
            if (event.source !== window) return;
            if (event.data.type !== 'FROM_EXTENSION') return;

            handleMessage(event.data.message).then(response => {
                window.postMessage({
                    type: 'PAGE_RESPONSE',
                    response: response
                }, '*');
            }).catch(error => {
                window.postMessage({
                    type: 'PAGE_RESPONSE',
                    response: { error: error.message }
                }, '*');
            });
        });

        // Set up AJAX navigation detection
        detectAjaxNavigation((type, url) => {
            console.log(`Navigation detected (${type}): ${url}`);
            // Re-initialize observers on navigation
            setupObservers();
        });

        await setupObservers();
        console.log('Content script initialized');
    } catch (error) {
        console.error('Content script initialization failed:', error);
    }
}

// Set up page observers
async function setupObservers() {
    // Wait for main content container
    const mainContent = await waitForElement('.main-content, #main-content, [role="main"]');

    // Handle dynamic content loading
    handleDynamicContent(mainContent, (mutations) => {
        console.log('New content detected');
    });

    // Handle infinite scroll if present
    detectInfiniteScroll(async () => {
        console.log('Infinite scroll triggered');
        await handleInfiniteScroll();
    });
}

// Handle messages from the wrapper
async function handleMessage(message) {
    console.log('Content script received message:', message);

    try {
        switch (message.action) {
            case 'scrape':
                return await handleScrapeRequest(message);

            default:
                throw new Error(`Unknown action: ${message.action}`);
        }
    } catch (error) {
        console.error('Error handling message:', error);
        throw error;
    }
}

// Handle scrape requests
async function handleScrapeRequest(message) {
    if (message.collectUrlsOnly) {
        // Collecting URLs from listing page
        return handleListingPage(message);
    } else if (message.isDetailPage) {
        // Scraping details from property page
        return handleDetailPage(message);
    }

    throw new Error('Invalid scrape request type');
}

// Handle listing page scraping
async function handleListingPage(message) {
    try {
        // Wait for property listings to load
        await waitForElement('[data-testid="property-card"], .property-card');

        // Extract URLs
        const urls = extractPropertyUrls();
        console.log(`Found ${urls.length} property URLs`);

        return {
            urls,
            pageNumber: message.pageNumber,
            success: true
        };
    } catch (error) {
        console.error('Error scraping listing page:', error);
        return {
            urls: [],
            pageNumber: message.pageNumber,
            error: error.message,
            success: false
        };
    }
}

// Handle detail page scraping
async function handleDetailPage(message) {
    try {
        // Wait for essential elements
        await Promise.all([
            waitForElement('.property-info-address, h1[class*="address"]'),
            waitForElement('.property-features, [data-testid="property-features"]')
        ]);

        // Extract property details
        const details = extractPropertyDetails();
        console.log('Extracted property details:', details);

        return {
            details,
            success: true
        };
    } catch (error) {
        console.error('Error scraping property details:', error);
        return {
            error: error.message,
            success: false
        };
    }
}

// Handle infinite scroll pagination
async function handleInfiniteScroll() {
    try {
        // Wait for new content to load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Extract new URLs
        const newUrls = extractPropertyUrls();

        // Send URLs to background script through the wrapper
        if (newUrls.length > 0) {
            window.postMessage({
                type: 'FROM_PAGE',
                message: {
                    action: 'urlsCollected',
                    urls: newUrls,
                    fromInfiniteScroll: true
                }
            }, '*');
        }
    } catch (error) {
        console.error('Error handling infinite scroll:', error);
    }
}

// Start initialization
initialize();
