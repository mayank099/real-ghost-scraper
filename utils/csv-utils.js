// Helper function to clean and format CSV values
export function formatCsvValue(value, isFeature = false) {
    if (value === null || value === undefined) {
        return '';
    }

    let formattedValue = value;
    if (typeof value === 'string') {
        // Remove line breaks and escape quotes for description or features
        if (isFeature) {
            formattedValue = value.replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
        }

        // Add quotes if the value contains commas or quotes
        if (value.includes(',') || value.includes('"')) {
            return `"${formattedValue}"`;
        }
    }
    return formattedValue;
}

// Helper function to clean feature values
export function cleanFeatureValues(features) {
    if (!Array.isArray(features)) return [];

    return [...new Set(features)].filter(feature => {
        if (/^\d+$/.test(feature)) return false;
        if (/^\d+\s*(bed|bath|car|garage|park)/i.test(feature)) return false;
        return true;
    });
}

// Helper function to extract headers and feature categories
export function extractHeadersAndFeatures(data) {
    const fields = new Set();
    const featureCategories = new Set();

    data.forEach(property => {
        if (!property) return;

        // Extract regular fields
        Object.keys(property).forEach(key => {
            if (key !== 'features') {
                fields.add(key);
            }
        });

        // Extract feature categories
        if (property.features) {
            Object.keys(property.features).forEach(category => {
                featureCategories.add(category);
            });
        }
    });

    return {
        headers: Array.from(fields),
        featureCategories: Array.from(featureCategories)
    };
}

// Generate CSV content from property data
export function generateCsvContent(validScrapedData) {
    const { headers, featureCategories } = extractHeadersAndFeatures(validScrapedData);
    const allHeaders = [...headers, ...featureCategories.map(cat => `Feature: ${cat}`)];

    // Create header row
    let csvContent = allHeaders.join(',') + '\n';

    // Add data rows
    validScrapedData.forEach(property => {
        const row = [
            // Add basic properties
            ...headers.map(header => formatCsvValue(property[header])),
            // Add features
            ...featureCategories.map(category => {
                const features = property.features?.[category] || [];
                const cleanedFeatures = cleanFeatureValues(features).join('; ');
                return formatCsvValue(cleanedFeatures, true);
            })
        ];
        csvContent += row.join(',') + '\n';
    });

    return csvContent;
}
