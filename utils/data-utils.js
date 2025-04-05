// Helper function to organize property data
export function organizePropertyData(propertyUrls, scrapedData) {
    // Create initial ordered array
    const orderedData = new Array(propertyUrls.length);

    // Create URL to index mapping
    const urlToIndexMap = new Map(
        propertyUrls.map((obj, index) => [getPropertyUrl(obj), index])
    );

    // Initialize with empty data
    propertyUrls.forEach((urlObj, i) => {
        const url = getPropertyUrl(urlObj);
        if (url) {
            orderedData[i] = createEmptyPropertyData(url, i);
        }
    });

    // Fill in scraped data while maintaining order
    scrapedData.forEach(item => {
        if (item?.url) {
            const index = urlToIndexMap.get(item.url);
            if (index !== undefined && orderedData[index]) {
                orderedData[index] = {
                    ...orderedData[index],
                    ...Object.fromEntries(
                        Object.entries(item).map(([key, value]) => [key, value || ''])
                    ),
                    scrapeStatus: 'success'
                };
            }
        }
    });

    // Clean up data
    return orderedData
        .filter(Boolean)
        .map(({ originalIndex, ...item }) => item);
}

// Helper function to handle rate limit detection
export function isRateLimited(error) {
    if (!error) return false;

    const message = error.message.toLowerCase();
    return message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('too many requests');
}

// Helper function to create error record
export function createErrorRecord({ phase, index, url, error }) {
    return {
        phase: phase || 'unknown',
        ...(index !== undefined && { propertyIndex: index }),
        ...(url && { url }),
        error: error.message || String(error),
        timestamp: new Date().toISOString()
    };
}

// Helper function to get URL from property object
function getPropertyUrl(urlObj) {
    if (typeof urlObj === 'string') {
        return urlObj;
    }
    return urlObj?.url || '';
}

// Helper function to create empty property data
function createEmptyPropertyData(url, index) {
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

// Helper function to calculate progress metrics
export function calculateProgress(currentIndex, batchSize, totalItems) {
    const batchPosition = currentIndex % batchSize;
    const currentBatch = Math.floor(currentIndex / batchSize) + 1;
    const totalBatches = Math.ceil(totalItems / batchSize);

    return {
        current: batchPosition + 1,
        total: Math.min(batchSize, totalItems - (currentBatch - 1) * batchSize),
        currentBatch,
        totalBatches,
        overallProgress: {
            current: currentIndex + 1,
            total: totalItems
        }
    };
}

// Helper function to validate scraped data
export function validateScrapedData(data) {
    if (!data || typeof data !== 'object') return false;

    // Required fields that should exist and have correct types
    const requiredFields = {
        url: 'string',
        address: 'string',
        price: 'string',
        bedrooms: ['string', 'number'],
        bathrooms: ['string', 'number'],
        carspaces: ['string', 'number'],
        propertyType: 'string'
    };

    return Object.entries(requiredFields).every(([field, expectedType]) => {
        const value = data[field];
        if (Array.isArray(expectedType)) {
            return expectedType.some(type => typeof value === type);
        }
        return typeof value === expectedType;
    });
}
