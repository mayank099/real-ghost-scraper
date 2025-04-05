const COOKIE_NAMES = [
    '_gcl_au', '_gid', '_ga', 'AMCVS_', 'AMCV_', 's_cc', 's_sq',
    'mbox', 'RT', '_fbp', 'reauid', 'reauids', 'visid_incap', 'incap_ses',
    'nlbi_', 'utag_main', '__gads', 'IDE', '_gat'
];

const BASE_DOMAIN = 'realestate.com.au';
const BASE_URL = `https://www.${BASE_DOMAIN}`;

// Clear specific cookies
async function clearKnownCookies() {
    for (const name of COOKIE_NAMES) {
        try {
            await chrome.cookies.remove({
                url: BASE_URL,
                name: name
            });
        } catch (error) {
            console.log(`Cookie ${name} not found or could not be removed`);
        }
    }
}

// Clear all domain cookies
async function clearAllDomainCookies() {
    try {
        const cookies = await chrome.cookies.getAll({ domain: BASE_DOMAIN });
        console.log(`Found ${cookies.length} cookies to clear`);

        await Promise.all(cookies.map(cookie =>
            chrome.cookies.remove({
                url: `${BASE_URL}${cookie.path}`,
                name: cookie.name
            })
        ));

        return cookies.length;
    } catch (error) {
        console.error('Error clearing domain cookies:', error);
        throw error;
    }
}

// Add random delay to avoid detection
async function addRandomDelay() {
    const minDelay = 2000; // 2 seconds
    const maxDelay = 5000; // 5 seconds
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

    console.log(`Adding random delay of ${delay}ms to avoid detection`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

// Calculate exponential backoff delay
export function calculateBackoffDelay(retryCount, baseDelay = 30000) {
    const delay = (Math.pow(2, retryCount) * baseDelay) + (Math.random() * 10000);
    return Math.min(delay, 300000); // Cap at 5 minutes
}

// Main cookie clearing function with rate limit prevention
export async function clearCookiesAndDelay() {
    console.log('Clearing cookies and session data to avoid rate limiting...');

    try {
        // Clear known cookies first
        await clearKnownCookies();

        // Then clear any remaining domain cookies
        const clearedCount = await clearAllDomainCookies();

        // Add random delay
        const delayTime = await addRandomDelay();

        return {
            success: true,
            clearedCount,
            delayTime
        };
    } catch (error) {
        console.error('Error in cookie clearing process:', error);
        // Still add delay even if cookie clearing fails
        await addRandomDelay();

        return {
            success: false,
            error: error.message
        };
    }
}
