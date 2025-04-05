// Function to scrape details from a property page
export async function scrapePropertyDetails(tabId, property, index, options) {
    const { isProcessing, retryCount = 0 } = options;

    if (!isProcessing) return null;

    console.log(`Scraping details for property ${index + 1}...${retryCount > 0 ? ` (Retry #${retryCount})` : ''}`);

    const propertyUrl = typeof property === 'string' ? property : property.url;
    if (!propertyUrl) {
        throw new Error('Invalid property URL');
    }

    // Navigate to the property page
    await chrome.tabs.update(tabId, { url: propertyUrl });

    // Initialize basic data structure
    const initialData = {
        url: propertyUrl,
        scrapeStatus: 'pending',
        scrapedAt: new Date().toISOString()
    };

    // Wait for page load and extract details
    const details = await waitForPageAndExtractDetails(tabId, index);

    return {
        ...initialData,
        ...details,
        scrapeStatus: 'success'
    };
}

// Function to wait for page load and extract details
async function waitForPageAndExtractDetails(tabId, propertyIndex) {
    return new Promise((resolve, reject) => {
        let timeoutId;

        function onPageLoad(updatedTabId, changeInfo, tab) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                handlePageLoad(tab, timeoutId, onPageLoad, resolve, reject, propertyIndex);
            }
        }

        // Set timeout for page load
        timeoutId = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onPageLoad);
            reject(new Error('Page load timeout'));
        }, 30000);

        chrome.tabs.onUpdated.addListener(onPageLoad);
    });
}

// Function to handle page load and initiate scraping
async function handlePageLoad(tab, timeoutId, onPageLoad, resolve, reject, propertyIndex) {
    // Check for rate limiting
    if (isRateLimitPage(tab)) {
        chrome.tabs.onUpdated.removeListener(onPageLoad);
        clearTimeout(timeoutId);
        reject(new Error('Rate limit detected (HTTP 429)'));
        return;
    }

    chrome.tabs.onUpdated.removeListener(onPageLoad);
    clearTimeout(timeoutId);

    // Wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // Check for rate limiting in content
        const isRateLimited = await checkForRateLimiting(tab.id);
        if (isRateLimited) {
            reject(new Error('Rate limit detected in page content'));
            return;
        }

        // Try content script first, fallback to direct scraping
        const details = await attemptScraping(tab.id, propertyIndex);
        resolve(details);
    } catch (error) {
        reject(error);
    }
}

// Function to check if page indicates rate limiting
function isRateLimitPage(tab) {
    return tab && (
        tab.url.includes('/429') ||
        tab.url.includes('rate-limited') ||
        tab.url.includes('too-many-requests') ||
        (tab.title && (
            tab.title.includes('429') ||
            tab.title.includes('Too Many Requests') ||
            tab.title.includes('Rate Limited')
        ))
    );
}

// Function to check page content for rate limiting
async function checkForRateLimiting(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const bodyText = document.body.innerText.toLowerCase();
            return bodyText.includes('429') ||
                bodyText.includes('too many requests') ||
                bodyText.includes('rate limit') ||
                bodyText.includes('blocked') ||
                bodyText.includes('try again later') ||
                !!document.querySelector('.error-page');
        }
    });

    return results?.[0]?.result === true;
}

// Function to attempt scraping with fallback
async function attemptScraping(tabId, propertyIndex) {
    try {
        return await scrapeWithContentScript(tabId, propertyIndex);
    } catch (error) {
        console.log('Content script scraping failed, attempting fallback...');
        return await scrapeDirectly(tabId);
    }
}

// Function to scrape using content script
async function scrapeWithContentScript(tabId, propertyIndex) {
    return new Promise((resolve, reject) => {
        let messageSent = false;

        chrome.tabs.sendMessage(tabId, {
            action: 'scrape',
            isDetailPage: true,
            propertyIndex
        }, response => {
            messageSent = true;
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (!response || response.error) {
                reject(new Error(response?.error || 'Failed to extract property details'));
            } else {
                resolve(response);
            }
        });

        // Timeout for message response
        setTimeout(() => {
            if (!messageSent) {
                reject(new Error('Content script message timeout'));
            }
        }, 5000);
    });
}

// Function to scrape directly using executeScript
async function scrapeDirectly(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            try {
                return {
                    address: document.querySelector('.property-info-address, h1[class*="address"]')?.textContent.trim() || '',
                    price: document.querySelector('.property-price, [class*="price"]')?.textContent.trim() || '',
                    bedrooms: document.body.textContent.match(/(\d+)\s*bed/i)?.[1] || '',
                    bathrooms: document.body.textContent.match(/(\d+)\s*bath/i)?.[1] || '',
                    carspaces: document.body.textContent.match(/(\d+)\s*car/i)?.[1] || '',
                    propertyType: window.location.href.match(/property-(house|unit|apartment|townhouse|land)/i)?.[1] || '',
                    url: window.location.href
                };
            } catch (error) {
                return { error: 'Fallback scraping failed: ' + error.message };
            }
        }
    });

    const details = results?.[0]?.result;
    if (!details || details.error) {
        throw new Error(details?.error || 'Failed to extract details');
    }

    return details;
}
