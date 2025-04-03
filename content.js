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
                    success: true
                });

                // Send response to confirm receipt
                // Send back both the status AND the details in the response
                sendResponse(propertyDetails);
            } else if (message.collectUrlsOnly) {
                console.log('Collecting property URLs from listing page...');

                // Get only property URLs from the listing page
                const properties = scrapePropertyLinks();

                console.log(`Found ${properties.length} property links on this page`);

                // Send results back to background script for URL collection
                chrome.runtime.sendMessage({
                    action: 'urlsCollected',
                    urls: properties.map(p => p.url),
                    pageNumber: getCurrentPageNumber()
                });

                // Send response to confirm receipt
                sendResponse({ status: "URLs collected successfully" });
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

// Function to get the current page number from URL
function getCurrentPageNumber() {
    const currentUrl = window.location.href;
    const pageMatch = currentUrl.match(/\/list-(\d+)/);
    return pageMatch ? parseInt(pageMatch[1]) : 1;
}

// Function to extract property URLs from the listing page
function scrapePropertyLinks() {
    // Array to hold property objects
    const properties = [];
    const pageNumber = getCurrentPageNumber();

    // Find all property links
    let propertyLinks = Array.from(document.querySelectorAll('a[href^="/property-"]'));

    // If no links found, try alternative approach
    if (propertyLinks.length === 0) {
        console.log('No property links found with primary selector, trying alternatives...');

        // Try finding cards first, then extract links from them
        const cardSelectors = [
            'article[data-testid="ResidentialCard"]',
            'div.residential-card__content-wrapper',
            'div[class*="residential-card"]',
            'div[role="presentation"] > div.residential-card__content',
            '.View__StyledResidentialCardHidePrice',
            'article'
        ];

        for (const selector of cardSelectors) {
            const cards = document.querySelectorAll(selector);
            if (cards.length > 0) {
                console.log(`Found ${cards.length} property cards with selector: ${selector}`);

                // Extract links from these cards
                cards.forEach(card => {
                    const link = card.querySelector('a[href^="/property-"]');
                    if (link) {
                        propertyLinks.push(link);
                    }
                });

                if (propertyLinks.length > 0) {
                    break;
                }
            }
        }
    }

    // Extract unique URLs and create property objects
    const uniqueUrls = new Set();

    propertyLinks.forEach((link, index) => {
        const href = link.getAttribute('href');

        // Skip if not a property link or already processed
        if (!href || !href.includes('/property-')) {
            return;
        }

        // Create full URL
        const url = href.startsWith('/')
            ? `https://www.realestate.com.au${href}`
            : href;

        // Skip if already added
        if (uniqueUrls.has(url)) {
            return;
        }

        uniqueUrls.add(url);

        // Create minimal property object with just URL and ID
        properties.push({
            id: `${pageNumber}-${index + 1}`,
            page: pageNumber,
            url: url,
            // These fields will be populated when visiting the detail page
            address: '',
            price: '',
            saleMethod: '',
            beds: 0,
            baths: 0,
            parking: 0,
            landSize: '',
            propertyType: '',
            agent: '',
            imageUrl: '',
            description: '',
            features: {}
        });
    });

    console.log(`Extracted ${properties.length} unique property URLs`);
    return properties;
}

// Helper function to clean text and fix encoding issues
function cleanText(text) {
    if (!text) return '';

    // Replace special characters and normalize
    return text
        .normalize('NFD')  // Normalize to decomposed form
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
        .replace(/√†/g, 'a')
        .replace(/√©/g, 'e')
        .replace(/√®/g, 'e')
        .replace(/√≠/g, 'i')
        .replace(/√≤/g, 'o')
        .replace(/√∫/g, 'u')
        .replace(/√±/g, 'n')
        .replace(/√§/g, 'a')
        .replace(/√ß/g, 'c')
        .replace(/√º/g, 'u')
        .replace(/√≤/g, 'o')
        .replace(/√≥/g, 'o')
        .replace(/√¬/g, 'i')
        .replace(/√ª/g, 'u')
        .replace(/√¢/g, 'a')
        .replace(/√™/g, 'e')
        .replace(/√æ/g, 'y')
        .replace(/m¬≤/g, 'sqm')  // Fix land size unit
        .replace(/m√≤/g, 'sqm')  // Another variant
        .replace(/m2/g, 'sqm')   // Another variant
        .replace(/fa√ßade/g, 'facade')  // Common word with encoding issues
        .replace(/\r?\n|\r/g, ' ')     // Replace line breaks with spaces
        .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
        .trim();
}

// Function to extract complete property details from a detail page
function scrapePropertyDetailsPage() {
    // Extract address
    let address = '';
    const addressElement = document.querySelector('.property-info-address, h1[class*="address"], [data-testid*="address"]');
    if (addressElement) {
        address = cleanText(addressElement.textContent.trim());
    }

    // Extract price and sale method
    let price = 'Price Not Mentioned!';
    let saleMethod = 'Not Available';

    // First look for indicative price in a separate container
    const indicativePriceContainer = document.querySelector('.styles__Container-sc-1cced9e-0, [class*="price-container"], [class*="Price-container"]');
    if (indicativePriceContainer) {
        const indicativeStrong = indicativePriceContainer.querySelector('strong');
        if (indicativeStrong && indicativeStrong.textContent.trim()) {
            price = cleanText(indicativeStrong.textContent.trim());
            saleMethod = 'Indicative Price';
        }
    }

    // If no indicative price found, look for regular price
    if (price === 'Price Not Mentioned!') {
        const priceElement = document.querySelector('.property-price, .property-info__price, [class*="price"], [class*="Price"]');
        if (priceElement) {
            const priceText = priceElement.textContent.trim();

            // Check for sale method keywords
            const saleMethods = [
                'Private Sale',
                'Auction',
                'For Sale',
                'Expressions of Interest',
                'EOI',
                'Contact Agent',
                'Price Guide'
            ];

            // Extract sale method
            for (const method of saleMethods) {
                if (priceText.toLowerCase().includes(method.toLowerCase())) {
                    saleMethod = method;
                    break;
                }
            }

            // Extract price if it contains a dollar sign
            if (priceText.includes('$')) {
                // Extract just the price portion including the dollar amount and range
                const priceMatch = priceText.match(/\$[\d,]+(\s*-\s*\$[\d,]+)?/);
                if (priceMatch) {
                    price = cleanText(priceMatch[0]);
                }
                // If no specific match but contains dollar sign, extract from $ onwards
                else {
                    const dollarIndex = priceText.indexOf('$');
                    if (dollarIndex !== -1) {
                        price = cleanText(priceText.substring(dollarIndex));
                    }
                }
            }
            // Handle "Contact Agent" as per requirements
            else if (priceText.toLowerCase().includes('contact agent')) {
                // Keep price as "Price Not Mentioned!" but set the sale method
                saleMethod = 'Contact Agent';
            }
        }
    }

    // Extract property features - beds, baths, parking
    // Extract property features - beds, baths, parking, land size
    let beds = 0, baths = 0, parking = 0, landSize = '';

    // First try to extract from the aria-label attribute
    const featuresWrapper = document.querySelector('.property-info__primary-features, ul[aria-label*="bedroom"], [class*="property-attributes"]');
    if (featuresWrapper) {
        // Try to get from aria-label which often contains all the information
        const ariaLabel = featuresWrapper.getAttribute('aria-label') || '';

        // Extract land size from aria-label
        const landSizeMatch = ariaLabel.match(/(\d+)(m²|m2|sqm)\s*land\s*size/i);
        if (landSizeMatch) {
            landSize = landSizeMatch[1] + 'sqm'; // Standardize to sqm
        }

        // Extract bedrooms, bathrooms, parking
        const bedMatch = ariaLabel.match(/(\d+)\s*bedrooms/i);
        if (bedMatch) beds = parseInt(bedMatch[1]);

        const bathMatch = ariaLabel.match(/(\d+)\s*bathrooms/i);
        if (bathMatch) baths = parseInt(bathMatch[1]);

        const carMatch = ariaLabel.match(/(\d+)\s*car\s*spaces/i);
        if (carMatch) parking = parseInt(carMatch[1]);

        // If land size wasn't found in aria-label, look for the specific land size element
        if (!landSize) {
            const landSizeElement = featuresWrapper.querySelector('li[aria-label*="land size"]');
            if (landSizeElement) {
                const landText = landSizeElement.textContent.trim();
                const landMatch = landText.match(/(\d+)(m²|m2|sqm)/i);
                if (landMatch) {
                    landSize = landMatch[1] + 'sqm';
                } else {
                    // If no match, try getting the plain text
                    landSize = cleanText(landText);
                }
            }
        }

        // If we couldn't extract features from aria-label, try individual elements
        if (beds === 0) {
            const bedElement = featuresWrapper.querySelector('li[aria-label*="bedroom"]');
            if (bedElement) {
                const text = bedElement.querySelector('p') ?
                    bedElement.querySelector('p').textContent.trim() :
                    bedElement.textContent.trim();

                const numMatch = text.match(/\d+/);
                if (numMatch) beds = parseInt(numMatch[0]);
            }
        }

        if (baths === 0) {
            const bathElement = featuresWrapper.querySelector('li[aria-label*="bathroom"]');
            if (bathElement) {
                const text = bathElement.querySelector('p') ?
                    bathElement.querySelector('p').textContent.trim() :
                    bathElement.textContent.trim();

                const numMatch = text.match(/\d+/);
                if (numMatch) baths = parseInt(numMatch[0]);
            }
        }

        if (parking === 0) {
            const parkElement = featuresWrapper.querySelector('li[aria-label*="car"]');
            if (parkElement) {
                const text = parkElement.querySelector('p') ?
                    parkElement.querySelector('p').textContent.trim() :
                    parkElement.textContent.trim();

                const numMatch = text.match(/\d+/);
                if (numMatch) parking = parseInt(numMatch[0]);
            }
        }
    }

    // Extract property type
    let propertyType = '';
    const breadcrumbLinks = document.querySelectorAll('.breadcrumbs__link, .Breadcrumbs, [class*="breadcrumb"]');
    breadcrumbLinks.forEach(link => {
        const text = link.textContent.toLowerCase();
        if (text.includes('house') ||
            text.includes('apartment') ||
            text.includes('unit') ||
            text.includes('townhouse')) {
            propertyType = cleanText(link.textContent.trim());
        }
    });

    // If we couldn't find property type in breadcrumbs, try to extract from URL
    if (!propertyType) {
        const url = window.location.href;
        const propertyTypeMatch = url.match(/property-([^-]+)/);
        if (propertyTypeMatch) {
            propertyType = propertyTypeMatch[1];
        }
    }

    // Extract agent information
    let agent = '';
    const agentElements = document.querySelectorAll('.agent-info__name');
    if (agentElements && agentElements.length > 0) {
        // Collect all agent names and remove duplicates
        const agentNames = Array.from(new Set(
            Array.from(agentElements).map(el =>
                cleanText(el.textContent.trim())
            )
        ));

        // Join unique agent names with semicolons
        agent = agentNames.join('; ');
    } else {
        // Fallback to other selectors if agent-info__name not found
        const agentElement = document.querySelector('[data-testid*="agent"], .agent__name, [aria-label*="Agent"], [class*="agent"], [class*="Agent"]');
        if (agentElement) {
            agent = cleanText(agentElement.textContent.trim());
        }
    }

    // Extract image URL
    let imageUrl = '';

    // Look for the primary hero image source
    const heroImageSource = document.querySelector('.hero-image source[srcset], .hero-poster__primary-container source[srcset]');
    if (heroImageSource) {
        imageUrl = heroImageSource.getAttribute('srcset');
        // If the srcset contains multiple sizes, take the first one
        if (imageUrl.includes(' ')) {
            imageUrl = imageUrl.split(' ')[0];
        }
    }

    // If not found, try to find the hero image directly
    if (!imageUrl) {
        const heroImage = document.querySelector('.hero-image img, .hero-poster__primary-container img');
        if (heroImage) {
            imageUrl = heroImage.getAttribute('src');
        }
    }

    // Final fallback to any property image
    if (!imageUrl) {
        const img = document.querySelector('img[alt*="image 1"], img[alt*="image 1 of"]');
        if (img) {
            imageUrl = img.getAttribute('src');
        }
    }

    // Get the property description
    let description = '';
    const descriptionSelectors = [
        '.property-description__content',
        '.TellMeMoreText-sc-1uhsiqq-1',
        '[data-testid="property-description"] p',
        '.property-description p',
        '.description-content'
    ];

    // Try each selector until we find one that works
    for (const selector of descriptionSelectors) {
        const descriptionElement = document.querySelector(selector);
        if (descriptionElement) {
            description = cleanText(descriptionElement.textContent.trim());
            break;
        }
    }

    // Extract property features
    const features = extractPropertyFeatures();

    // Return complete property details
    return {
        url: window.location.href,
        address,
        price,
        saleMethod,
        bedrooms: beds,
        bathrooms: baths,
        carspaces: parking,
        landSize,
        propertyType,
        agent,
        mainImage: imageUrl,
        description,
        features
    };
}

// Helper function to extract property features from the detail page
function extractPropertyFeatures() {
    let featuresObject = {};
    let featureCount = 0;

    // Try multiple selectors for feature categories
    const featureSelectors = [
        '.styles__PropertyFeatureCategory-sc-1t6a7h5-4',
        '.PropertyFeatureCategory',
        '[data-testid="property-features-section"] .property-features__category',
        '.property-features-wrapper .feature-category',
        '[data-testid="all-property-features-section"] [class*="Category"]'
    ];

    // Try to find feature categories using different selectors
    let featureCategories = [];
    for (const selector of featureSelectors) {
        featureCategories = document.querySelectorAll(selector);
        if (featureCategories && featureCategories.length > 0) {
            break;
        }
    }

    // Process each feature category
    featureCategories.forEach(category => {
        // Try different selectors for category title
        let categoryTitle = '';
        const possibleTitleElements = [
            category.querySelector('h3'),
            category.querySelector('.category-title'),
            category.querySelector('[class*="heading"]'),
            category.querySelector('strong')
        ];

        for (const element of possibleTitleElements) {
            if (element && element.textContent) {
                categoryTitle = cleanText(element.textContent.trim());
                break;
            }
        }

        // Use default if no title found
        if (!categoryTitle) {
            categoryTitle = 'Other Features';
        }

        // Create array to hold features for this category
        featuresObject[categoryTitle] = [];

        // Try different selectors for feature items
        const itemSelectors = [
            '.styles__PropertyFeatureItemSection-sc-1t6a7h5-2',
            '.PropertyFeatureItem',
            '.feature-item',
            'li'
        ];

        let featureItems = [];
        for (const selector of itemSelectors) {
            featureItems = category.querySelectorAll(selector);
            if (featureItems && featureItems.length > 0) {
                break;
            }
        }

        // Process each feature item
        featureItems.forEach(item => {
            // Try different possible text containers
            const possibleTextElements = [
                item.querySelector('p'),
                item.querySelector('span'),
                item.querySelector('[class*="Text"]'),
                item
            ];

            for (const element of possibleTextElements) {
                if (element && element.textContent) {
                    const featureText = cleanText(element.textContent.trim());
                    if (featureText) {
                        featuresObject[categoryTitle].push(featureText);
                        featureCount++;
                        break;
                    }
                }
            }
        });
    });

    // If we don't have features, try a generic approach
    if (Object.keys(featuresObject).length === 0) {
        featuresObject['Features'] = [];

        // Last resort: look for any feature-like elements
        const allFeatureItems = document.querySelectorAll(
            '[class*="feature"], [class*="Feature"], [data-testid*="feature"], li[aria-label]'
        );

        allFeatureItems.forEach(item => {
            if (item.textContent) {
                const text = cleanText(item.textContent.trim());
                // Only add if it looks like a feature (not too long, not empty)
                if (text && text.length < 100) {
                    featuresObject['Features'].push(text);
                    featureCount++;
                }
            }
        });
    }

    return featuresObject;
}
