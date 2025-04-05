// Selectors for different property elements
const SELECTORS = {
    propertyCards: '[data-testid="property-card"], .property-card, .residential-card',
    propertyLinks: 'a[href*="/property/"], a[href*="/address/"]',
    address: '.property-info-address, h1[class*="address"], [data-testid*="address"]',
    price: '.property-price, .property-info__price, [class*="price"], [class*="Price"]',
    features: '.property-features, [data-testid="property-features"]',
    description: '.property-description, [data-testid="description"]',
    agent: '.agent-details, [data-testid="agent"]',
    images: '.property-image img, [data-testid="gallery"] img'
};

// Function to extract property URLs from listing page
export function extractPropertyUrls() {
    const urls = new Set();

    // Find all property cards
    const propertyCards = document.querySelectorAll(SELECTORS.propertyCards);
    propertyCards.forEach(card => {
        const links = card.querySelectorAll(SELECTORS.propertyLinks);
        links.forEach(link => {
            if (link.href) urls.add(link.href);
        });
    });

    // Find any additional property links
    document.querySelectorAll(SELECTORS.propertyLinks).forEach(link => {
        if (link.href) urls.add(link.href);
    });

    return Array.from(urls);
}

// Function to extract property details from detail page
export function extractPropertyDetails() {
    const details = {
        url: window.location.href,
        address: '',
        price: '',
        bedrooms: '',
        bathrooms: '',
        carspaces: '',
        propertyType: '',
        features: {},
        agent: '',
        mainImage: '',
        description: ''
    };

    try {
        // Extract basic details
        details.address = extractText(SELECTORS.address);
        details.price = extractText(SELECTORS.price);
        details.description = extractText(SELECTORS.description);

        // Extract features
        const features = extractFeatures();
        Object.assign(details, features);

        // Extract agent information
        details.agent = extractAgentInfo();

        // Extract main image
        details.mainImage = extractMainImage();

        // Extract property type from URL or content
        details.propertyType = extractPropertyType();

        return details;
    } catch (error) {
        console.error('Error extracting property details:', error);
        return { ...details, error: error.message };
    }
}

// Helper function to extract text content safely
function extractText(selector, parent = document) {
    const element = parent.querySelector(selector);
    return element ? element.textContent.trim() : '';
}

// Function to extract property features
function extractFeatures() {
    const features = {
        bedrooms: '',
        bathrooms: '',
        carspaces: '',
        features: {
            outdoor: [],
            indoor: [],
            heating: [],
            cooling: [],
            ecoFriendly: []
        }
    };

    // Extract room numbers from text content
    const featureText = document.body.textContent;
    features.bedrooms = featureText.match(/(\d+)\s*bed/i)?.[1] || '';
    features.bathrooms = featureText.match(/(\d+)\s*bath/i)?.[1] || '';
    features.carspaces = featureText.match(/(\d+)\s*car/i)?.[1] || '';

    // Extract feature categories
    const featureElements = document.querySelectorAll(SELECTORS.features);
    featureElements.forEach(element => {
        const text = element.textContent.toLowerCase();

        // Categorize features
        if (text.includes('outdoor') || text.includes('garden')) {
            features.features.outdoor.push(element.textContent.trim());
        }
        if (text.includes('heating')) {
            features.features.heating.push(element.textContent.trim());
        }
        if (text.includes('cooling') || text.includes('air')) {
            features.features.cooling.push(element.textContent.trim());
        }
        if (text.includes('solar') || text.includes('eco')) {
            features.features.ecoFriendly.push(element.textContent.trim());
        }
    });

    return features;
}

// Function to extract agent information
function extractAgentInfo() {
    const agentElement = document.querySelector(SELECTORS.agent);
    if (!agentElement) return '';

    const agentInfo = [];

    // Extract agent name
    const name = agentElement.querySelector('[class*="name"], [class*="Name"]');
    if (name) agentInfo.push(name.textContent.trim());

    // Extract agency
    const agency = agentElement.querySelector('[class*="agency"], [class*="Agency"]');
    if (agency) agentInfo.push(agency.textContent.trim());

    // Extract contact info
    const contact = agentElement.querySelector('[class*="contact"], [class*="phone"]');
    if (contact) agentInfo.push(contact.textContent.trim());

    return agentInfo.join(' - ');
}

// Function to extract main property image
function extractMainImage() {
    const images = document.querySelectorAll(SELECTORS.images);
    if (!images.length) return '';

    // Try to find the main/hero image
    const mainImage = Array.from(images).find(img =>
        img.src && (
            img.width > 800 || // Likely a hero image
            img.classList.contains('hero') ||
            img.classList.contains('main') ||
            img.closest('[class*="hero"]', '[class*="main"]')
        )
    );

    return mainImage ? mainImage.src : (images[0].src || '');
}

// Function to extract property type
function extractPropertyType() {
    // Try to extract from URL first
    const urlMatch = window.location.href.match(/property-(house|unit|apartment|townhouse|land)/i);
    if (urlMatch) return urlMatch[1].toLowerCase();

    // Try to extract from content
    const contentText = document.body.textContent.toLowerCase();
    const types = ['house', 'unit', 'apartment', 'townhouse', 'land'];

    for (const type of types) {
        if (contentText.includes(type)) {
            return type;
        }
    }

    return '';
}
