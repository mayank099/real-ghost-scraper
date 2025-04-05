/**
 * Extract property details from a real estate page and output as JSON in .txt file
 * @param {string} pageUrl - The URL of the property page (optional)
 * @returns {Object} - Object containing all extracted property details
 */
function extractPropertyDetails(pageUrl = window.location.href) {
    // Initialize data object with empty values
    const propertyData = {
        uniqueId: '',
        propertyType: '',
        propertyUrl: pageUrl,
        price: '',
        saleType: '',
        auctionDate: '',
        address: '',
        locality: '',
        bedroom: '',
        bathroom: '',
        carSpace: '',
        landSize: '',
        description: '',
        agentNames: [],
        agentPhones: [],
        features: [],
        scrapedTime: new Date().toISOString()
    };

    try {
        // Extract unique ID from URL
        try {
            if (pageUrl) {
                const match = pageUrl.match(/[0-9]+$/);
                if (match && match[0]) {
                    propertyData.uniqueId = match[0];
                    console.log("Extracted ID:", propertyData.uniqueId);
                }
            }
        } catch (error) {
            console.warn('Could not extract property ID from URL');
        }

        // Extract address
        const addressElement = document.querySelector('.property-info-address');
        if (addressElement && addressElement.textContent) {
            propertyData.address = addressElement.textContent.trim();
            console.log("Extracted address:", propertyData.address);

            const addressParts = propertyData.address.split(',');
            if (addressParts.length >= 2) {
                // The locality is typically the second-to-last part when split by commas
                let localityPart = addressParts[addressParts.length - 2].trim();

                // Fallback to last part if there aren't enough parts
                if (!localityPart && addressParts.length >= 1) {
                    localityPart = addressParts[addressParts.length - 1].trim();
                }

                // Clean up by removing state/postcode if present
                if (localityPart) {
                    const localityClean = localityPart.split(' ')[0].trim();
                    propertyData.locality = localityClean;
                    console.log("Extracted locality:", propertyData.locality);
                }
            }
        } else {
            console.log("Could not find address element");
        }

        // Extract price
        const priceElement = document.querySelector('.property-price');
        if (priceElement && priceElement.textContent) {
            // Get the raw price text
            let priceText = priceElement.textContent.trim();

            priceText = priceText.replace(/^(From|Offers over|Offers above|Guide|Price guide|Around|Circa|From about|Approximately|Contact agent for price|Contact agent|Price on application|POA|Auction guide)\s+/i, '');

            // Keep only the price format (numbers with $ and possibly a range with dash)
            const priceMatch = priceText.match(/(\$[0-9,]+(\s*-\s*\$[0-9,]+)?)/);
            if (priceMatch && priceMatch[1]) {
                propertyData.price = priceMatch[1].trim();
            } else {
                propertyData.price = priceText; // Fallback to original if pattern doesn't match
            }

            console.log("Extracted price:", propertyData.price);
        } else {
            console.log("Could not find price element");
        }

        // Extract property type - direct method from the HTML structure you shared
        // This is looking for a standalone <p> with the class within the property-info__primary-features
        const propertyTypeElement = document.querySelector('.property-info__primary-features > p.Text__Typography-sc-1103tao-0.couPoG');
        if (propertyTypeElement && propertyTypeElement.textContent) {
            propertyData.propertyType = propertyTypeElement.textContent.trim();
            console.log("Found property type:", propertyData.propertyType);
        }

        // Extract bedroom, bathroom, car space
        const propertyAttributes = document.querySelector('.property-info__property-attributes');
        if (propertyAttributes) {
            // Extract bedroom count
            const bedrooms = propertyAttributes.querySelector('li[aria-label*="bedroom"]');
            if (bedrooms) {
                const bedroomText = bedrooms.querySelector('p');
                if (bedroomText && bedroomText.textContent) {
                    propertyData.bedroom = bedroomText.textContent.trim();
                    console.log("Extracted bedrooms:", propertyData.bedroom);
                }
            }

            // Extract bathroom count
            const bathrooms = propertyAttributes.querySelector('li[aria-label*="bathroom"]');
            if (bathrooms) {
                const bathroomText = bathrooms.querySelector('p');
                if (bathroomText && bathroomText.textContent) {
                    propertyData.bathroom = bathroomText.textContent.trim();
                    console.log("Extracted bathrooms:", propertyData.bathroom);
                }
            }

            // Extract car spaces
            const carSpaces = propertyAttributes.querySelector('li[aria-label*="car space"]');
            if (carSpaces) {
                const carSpaceText = carSpaces.querySelector('p');
                if (carSpaceText && carSpaceText.textContent) {
                    propertyData.carSpace = carSpaceText.textContent.trim();
                    console.log("Extracted car spaces:", propertyData.carSpace);
                }
            }

            // Extract land size
            const landSize = propertyAttributes.querySelector('li[aria-label*="land size"]');
            const buildingSize = propertyAttributes.querySelector('li[aria-label*="building size"]');

            if (landSize) {
                const landSizeText = landSize.querySelector('p');
                if (landSizeText && landSizeText.textContent) {
                    propertyData.landSize = landSizeText.textContent.trim();
                    console.log("Extracted land size:", propertyData.landSize);
                }
            } else if (buildingSize) {
                // If no land size is found, try to get building size instead
                const buildingSizeText = buildingSize.querySelector('p');
                if (buildingSizeText && buildingSizeText.textContent) {
                    propertyData.landSize = buildingSizeText.textContent.trim();
                    console.log("Extracted building size as land size:", propertyData.landSize);
                }
            } else {
                console.log("Could not find land size or building size");
            }
        } else {
            console.log("Could not find property attributes container");
        }

        // Backup method for property type if not found above
        if (!propertyData.propertyType) {
            // Try to find it in the aria-label of the container
            const ariaLabel = document.querySelector('.property-info__primary-features')?.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.startsWith('House')) {
                propertyData.propertyType = 'House';
                console.log("Set property type to House based on aria-label");
            } else if (ariaLabel && ariaLabel.includes('House')) {
                propertyData.propertyType = 'House';
                console.log("Set property type to House based on aria-label (includes)");
            }

            // If still not found, try the most common property types from the URL
            if (!propertyData.propertyType) {
                if (pageUrl.includes('house')) {
                    propertyData.propertyType = 'House';
                    console.log("Set property type to House based on URL");
                } else if (pageUrl.includes('apartment')) {
                    propertyData.propertyType = 'Apartment';
                } else if (pageUrl.includes('townhouse')) {
                    propertyData.propertyType = 'Townhouse';
                } else if (pageUrl.includes('unit')) {
                    propertyData.propertyType = 'Unit';
                } else {
                    propertyData.propertyType = 'House'; // Default fallback
                    console.log("Set property type to House as default fallback");
                }
            }
        }

        // Extract auction details
        const auctionElement = document.querySelector('.View__AuctionDetails-sc-lc4uvf-0');
        if (auctionElement) {
            propertyData.saleType = 'Auction';
            console.log("Sale type is Auction");

            const auctionSpan = auctionElement.querySelector('span[role="text"]');
            if (auctionSpan && auctionSpan.textContent) {
                const auctionText = auctionSpan.textContent;
                if (auctionText.includes('Auction')) {
                    propertyData.auctionDate = auctionText.replace('Auction', '').trim();
                    console.log("Extracted auction date:", propertyData.auctionDate);
                }
            }
        } else {
            console.log("Could not find auction element, checking for other sale types");

            // Check for other sale type indicators
            if (propertyData.price) {
                const priceText = propertyData.price.toLowerCase();
                if (priceText.includes('for sale') ||
                    priceText.includes('contact agent') ||
                    priceText.includes('-')) {
                    propertyData.saleType = 'Private Sale';
                    console.log("Determined sale type as Private Sale based on price format");
                }
            }
        }

        // Extract description
        const descriptionElement = document.querySelector('.property-description__content');
        if (descriptionElement && descriptionElement.textContent) {
            propertyData.description = descriptionElement.textContent.trim();
            console.log("Extracted description (length):", propertyData.description.length);
        } else {
            console.log("Could not find description element, trying alternative selector");

            // Try alternative selector
            const altDescriptionElement = document.querySelector('.styles__PropertyDescriptionBody-sc-8e6gfp-0 p');
            if (altDescriptionElement && altDescriptionElement.textContent) {
                propertyData.description = altDescriptionElement.textContent.trim();
                console.log("Extracted description from alt element (length):", propertyData.description.length);
            } else {
                console.log("Could not find description with alternative selector either");
            }
        }

        // Extract agents with deduplication
        const agentElements = document.querySelectorAll('.agent-info__agent');
        if (agentElements && agentElements.length > 0) {
            console.log(`Found ${agentElements.length} agent elements`);

            // Create arrays to store agents and phones
            const tempAgentNames = [];
            const tempAgentPhones = [];

            agentElements.forEach(agent => {
                if (!agent) return;

                // Extract agent name
                const nameElement = agent.querySelector('.agent-info__name');
                if (nameElement && nameElement.textContent) {
                    tempAgentNames.push(nameElement.textContent.trim());
                }

                // Extract agent phone
                const phoneLink = agent.querySelector('.phone__link');
                if (phoneLink && phoneLink.href && phoneLink.href.startsWith('tel:')) {
                    // Extract phone from href attribute (tel:number)
                    const phone = phoneLink.href.replace('tel:', '');
                    if (phone) {
                        tempAgentPhones.push(phone);
                    }
                } else {
                    // If we can't get the full number from the link, try the partial number
                    const phoneElement = agent.querySelector('.phone__reveal-text');
                    if (phoneElement && phoneElement.textContent) {
                        // Remove ellipsis if present
                        let phone = phoneElement.textContent.trim().replace('...', '');
                        tempAgentPhones.push(phone);
                    }
                }
            });

            // Deduplicate agent names and phones using objects to maintain relationship
            const agentMap = {};

            for (let i = 0; i < tempAgentNames.length; i++) {
                const name = tempAgentNames[i];
                const phone = i < tempAgentPhones.length ? tempAgentPhones[i] : '';

                // Use name as key to avoid duplicates
                if (!agentMap[name]) {
                    agentMap[name] = phone;
                }
            }

            // Convert back to arrays
            propertyData.agentNames = Object.keys(agentMap);
            propertyData.agentPhones = Object.values(agentMap).filter(Boolean);

            console.log("Extracted unique agent names:", propertyData.agentNames.join(', '));
            console.log("Extracted unique agent phones:", propertyData.agentPhones.join(', '));
        } else {
            console.log("Could not find agent elements");
        }

        // Extract features
        const featureElements = document.querySelectorAll('.styles__PropertyFeatureItemSection-sc-1t6a7h5-2');
        if (featureElements && featureElements.length > 0) {
            console.log(`Found ${featureElements.length} feature elements`);

            featureElements.forEach(feature => {
                if (!feature) return;

                const featureText = feature.querySelector('p');
                if (featureText && featureText.textContent) {
                    const text = featureText.textContent.trim();
                    propertyData.features.push(text);
                    console.log("Extracted feature:", text);
                }
            });
        } else {
            console.log("Could not find feature elements, trying alternative selector");

            // Try alternative selector
            const altFeatureElements = document.querySelectorAll('[data-testid="top-property-features-section"] > div');
            if (altFeatureElements && altFeatureElements.length > 0) {
                console.log(`Found ${altFeatureElements.length} feature elements with alternative selector`);

                altFeatureElements.forEach(feature => {
                    if (!feature) return;

                    const featureText = feature.querySelector('p');
                    if (featureText && featureText.textContent) {
                        const text = featureText.textContent.trim();
                        propertyData.features.push(text);
                        console.log("Extracted feature from alt element:", text);
                    }
                });
            } else {
                console.log("Could not find feature elements with alternative selector either");
            }
        }

        return propertyData;
    } catch (error) {
        console.error('Error extracting property details:', error);
        return propertyData; // Return the object with empty values
    }
}

/**
 * Creates a downloadable TXT file containing JSON data
 * @param {Object} data - The property data object
 * @param {string} filename - The filename to use
 */
function downloadAsTxt(data, filename) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);

        console.log(`TXT file "${filename}" has been downloaded successfully.`);
    } catch (error) {
        console.error('Error downloading TXT file:', error);
    }
}

/**
 * Main function to run the extraction process for a specific property
 * @param {string} url - The URL of the property to extract data from
 */
function extractPropertyFromUrl(url) {
    try {
        console.log("Extracting property data from:", url);

        // Extract the property data
        const propertyData = extractPropertyDetails(url);

        // Output the data as JSON to the console
        console.log("Extracted data (JSON format):");
        console.log(JSON.stringify(propertyData, null, 2));

        // Download the data as a TXT file
        const filename = `property_${propertyData.uniqueId || 'unknown'}.txt`;
        downloadAsTxt(propertyData, filename);

        return propertyData;
    } catch (error) {
        console.error("Error in extraction process:", error);
        return {};
    }
}

// Run the extraction on the current page or a specific URL
function run(url = window.location.href) {
    return extractPropertyFromUrl(url);
}

// Execute the extraction for the hardcoded URL
var propertyData = run("https://www.realestate.com.au/property-house-vic-vermont-147556956");
console.log("Extraction complete. Data is available in the 'propertyData' variable.");

// Copy the JSON to clipboard for easy pasting
try {
    const jsonString = JSON.stringify(propertyData, null, 2);
    navigator.clipboard.writeText(jsonString)
        .then(() => console.log("JSON data copied to clipboard!"))
        .catch(err => console.error("Could not copy to clipboard:", err));
} catch (e) {
    console.log("Clipboard API not available. Please copy the JSON manually from the console output.");
}