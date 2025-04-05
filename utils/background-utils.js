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

// Function to generate and download CSV file
function generateCSV(allResults) {
    if (allResults.length === 0) {
        console.log('No properties to export');
        chrome.runtime.sendMessage({
            action: 'scrapingError',
            error: 'No results to download. Please scrape some properties first.'
        });
        return;
    }

    console.log('Generating CSV file...');

    try {
        // Create header row - get all possible fields
        const allFields = new Set();
        allResults.forEach(property => {
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
        allResults.forEach(property => {
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

        // Add data rows
        allResults.forEach(property => {
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

export { extractBaseUrl, constructPageUrl, generateCSV };