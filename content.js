import { scrapePropertyLinks, scrapePropertyDetailsPage } from './utils/contentUtils.js';

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log('Content script received message:', message);

    if (message.action === 'scrape') {
        console.log('Starting to scrape...');

        try {
            // Check if we're on a property detail page or a listing page
            const isDetailPage = message.isDetailPage ||
                (window.location.href.includes('/property-') &&
                    !window.location.href.includes('/list-'));

            console.log(`URL: ${window.location.href}, isDetailPage: ${isDetailPage}`);

            if (isDetailPage) {
                console.log('Detected property detail page, extracting details...');

                // Extract complete details from the property page
                const propertyDetails = scrapePropertyDetailsPage();

                // Send results back to background script
                chrome.runtime.sendMessage({
                    action: 'propertyDetailsScraped',
                    details: propertyDetails,
                    batchSize: message.batchSize || 1
                });
            } else {
                console.log('Detected listing page, extracting property URLs...');

                // Get only property URLs from the listing page
                const properties = scrapePropertyLinks();

                console.log(`Found ${properties.length} property links on this page`);

                // Send results back to background script
                chrome.runtime.sendMessage({
                    action: 'scrapeResults',
                    results: properties,
                    visitDetails: message.visitDetails
                });
            }
        } catch (error) {
            console.error("Error during scraping:", error);

            // Send error message to background script
            chrome.runtime.sendMessage({
                action: 'scrapingError',
                error: `Scraping error: ${error.message}`
            });
        }

        // Send immediate response to keep the message channel open
        sendResponse({ status: "Scraping in progress" });
        return true;
    }

    // Return true to keep the message channel open
    return true;
});