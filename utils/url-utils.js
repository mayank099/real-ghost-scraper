// Extract URL from property object
export function getPropertyUrl(urlObj) {
    if (typeof urlObj === 'string') {
        return urlObj;
    }
    return urlObj?.url || '';
}

// Create empty property data structure
export function createEmptyPropertyData(url, index) {
    return {
        originalIndex: index,
        url,
        address: '',
        price: '',
        description: '',
        bedrooms: '',
        bathrooms: '',
        carspaces: '',
        propertyType: '',
        agent: '',
        mainImage: '',
        features: {},
        scrapeStatus: 'not_scraped',
        scrapedAt: new Date().toISOString()
    };
}

// Extract base URL without list-X part
export function extractBaseUrl(url) {
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

// Construct page URL for pagination
export function constructPageUrl(baseUrl, pageNumber) {
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

// Validate and format property URLs
export function formatPropertyUrls(urls) {
    if (!Array.isArray(urls)) return [];

    return urls
        .filter(url => url && typeof url === 'string' && url.includes('realestate.com.au'))
        .map(url => ({
            url: url.trim(),
            scrapeAttempts: 0,
            addedAt: new Date().toISOString()
        }));
}
