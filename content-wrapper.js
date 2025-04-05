// Create a script element to load the ES module content script
const script = document.createElement('script');
script.type = 'module';

// Get the chrome extension URL for the content script
const contentScriptUrl = chrome.runtime.getURL('content.js');
script.src = contentScriptUrl;

// Add error handling
script.onerror = (error) => {
    console.error('Error loading content script module:', error);
};

// Inject the script into the page
(document.head || document.documentElement).appendChild(script);

// Set up message passing between the page script and extension
window.addEventListener('message', function (event) {
    // Only accept messages from the same window
    if (event.source !== window) return;

    // Forward messages from the page to the extension
    if (event.data.type && event.data.type === 'FROM_PAGE') {
        chrome.runtime.sendMessage(event.data.message);
    }
});

// Forward messages from the extension to the page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    window.postMessage({
        type: 'FROM_EXTENSION',
        message: message
    }, '*');

    // Handle responses from the page
    window.addEventListener('message', function responseHandler(event) {
        if (event.source !== window) return;
        if (event.data.type === 'PAGE_RESPONSE') {
            window.removeEventListener('message', responseHandler);
            sendResponse(event.data.response);
        }
    });

    return true; // Keep the message channel open for async response
});

// Log successful injection
console.log('Content script wrapper initialized');
