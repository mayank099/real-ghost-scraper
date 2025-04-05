// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // Get UI elements
    const startButton = document.getElementById('startScraping');
    const stopButton = document.getElementById('stopScraping');
    const downloadButton = document.getElementById('downloadCSV');
    const statusText = document.getElementById('status');
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress-bar');
    const statusIcon = document.querySelector('.status-icon');

    // Input fields
    const startPageInput = document.getElementById('startPage');
    const endPageInput = document.getElementById('endPage');
    const delayInput = document.getElementById('delay');

    // Keep track of results
    let allResults = [];

    // Initially disable the stop and download buttons
    stopButton.disabled = true;
    downloadButton.disabled = true;

    // Function to update the status message and icon
    function updateStatus(message, type = 'info') {
        statusText.textContent = message;

        // Update the status icon based on type
        statusIcon.textContent = getIconForStatus(type);
        statusIcon.style.color = getColorForStatus(type);
    }

    // Get the appropriate icon for different status types
    function getIconForStatus(type) {
        switch (type) {
            case 'success': return 'check_circle';
            case 'error': return 'error';
            case 'warning': return 'warning';
            case 'progress': return 'sync';
            case 'info':
            default: return 'info';
        }
    }

    // Get the appropriate color for different status types
    function getColorForStatus(type) {
        switch (type) {
            case 'success': return '#0F9D58'; // Success color
            case 'error': return '#DB4437';   // Accent/error color
            case 'warning': return '#F4B400'; // Warning color
            case 'progress': return '#4285F4'; // Primary color
            case 'info':
            default: return '#4285F4';        // Primary color
        }
    }

    // Function to update progress bar
    function updateProgress(current, total) {
        if (total > 0) {
            const percentage = (current / total) * 100;
            progressBar.style.width = `${percentage}%`;
            progressContainer.style.display = 'block';
        } else {
            progressContainer.style.display = 'none';
        }
    }

    // Add a pulsing animation to the progress icon
    function setPulsingAnimation(active) {
        if (active) {
            statusIcon.style.animation = 'pulse 1.5s infinite';
        } else {
            statusIcon.style.animation = 'none';
        }
    }

    // Handle Start Scraping button click
    startButton.addEventListener('click', function () {
        // Get scraping parameters from input fields
        const startPage = parseInt(startPageInput.value) || 1;
        const endPage = parseInt(endPageInput.value) || 3;
        const delay = parseInt(delayInput.value) || 3000;

        // Validate inputs
        if (startPage <= 0 || endPage <= 0) {
            updateStatus('Page numbers must be positive values', 'error');
            return;
        }

        if (startPage > endPage) {
            updateStatus('Start page cannot be greater than end page', 'error');
            return;
        }

        if (delay < 1000) {
            updateStatus('Delay should be at least 1000ms to avoid rate limiting', 'warning');
            return;
        }

        // Get the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) {
                updateStatus('No active tab found', 'error');
                return;
            }

            const activeTab = tabs[0];

            // Check if we're on realestate.com.au
            if (!activeTab.url.includes('realestate.com.au')) {
                updateStatus('Error: Please navigate to realestate.com.au before starting', 'error');
                return;
            }

            // Update UI
            startButton.disabled = true;
            stopButton.disabled = false;
            downloadButton.disabled = true;
            updateStatus('Initializing scraper...', 'progress');
            setPulsingAnimation(true);

            // Reset results
            allResults = [];

            // Show the progress bar at 0%
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';

            // Send message to background script to start scraping
            chrome.runtime.sendMessage({
                action: 'startScraping',
                startPage: startPage,
                endPage: endPage,
                delay: delay,
                tabId: activeTab.id,
                url: activeTab.url
            }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Error starting scraping:", chrome.runtime.lastError);
                    updateStatus('Error starting the scraper. Please reload the extension.', 'error');
                    setPulsingAnimation(false);
                    startButton.disabled = false;
                }
            });
        });
    });

    // Handle Stop Scraping button click
    stopButton.addEventListener('click', function () {
        // Update UI
        startButton.disabled = false;
        stopButton.disabled = true;
        if (allResults.length > 0) {
            downloadButton.disabled = false;
        }
        updateStatus('Scraping stopped', 'warning');
        setPulsingAnimation(false);

        // Send message to background script to stop scraping
        chrome.runtime.sendMessage({
            action: 'stopScraping'
        }, function (response) {
            if (chrome.runtime.lastError) {
                console.error("Error stopping scraping:", chrome.runtime.lastError);
            }
        });
    });

    // Handle Download CSV button click
    downloadButton.addEventListener('click', function () {
        updateStatus('Generating CSV...', 'progress');
        setPulsingAnimation(true);

        // Send message to background script to generate and download CSV
        chrome.runtime.sendMessage({
            action: 'downloadCSV'
        }, function (response) {
            if (chrome.runtime.lastError) {
                console.error("Error downloading CSV:", chrome.runtime.lastError);
                updateStatus('Error generating CSV file', 'error');
                setPulsingAnimation(false);
            }
        });
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(function (message) {
        console.log('Popup received message:', message);

        if (message.action === 'scrapingComplete') {
            // Update UI when scraping is complete
            startButton.disabled = false;
            stopButton.disabled = true;
            downloadButton.disabled = false;
            updateStatus(`Scraping complete! Found ${message.totalResults} properties.`, 'success');
            setPulsingAnimation(false);

            // Complete the progress bar
            progressBar.style.width = '100%';

            // Hide progress bar after a moment
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);
        }
        else if (message.action === 'scrapingProgress') {
            // Update progress status for listing pages
            updateStatus(`Scraping page ${message.currentPage}: Found ${message.results.length} properties`, 'progress');

            // Update total results count
            allResults = message.total || allResults.length;

            // Update progress based on current page vs. total pages
            const startPage = parseInt(startPageInput.value) || 1;
            const endPage = parseInt(endPageInput.value) || 1;
            const totalPages = endPage - startPage + 1;
            const currentPageIndex = message.currentPage - startPage + 1;

            updateProgress(currentPageIndex, totalPages);
        }
        else if (message.action === 'detailProgress') {
            // Update progress for detail page scraping
            updateStatus(`Visiting property details: ${message.current} of ${message.total}`, 'progress');
        }
        else if (message.action === 'scrapingError') {
            // Handle errors
            updateStatus(`Error: ${message.error}`, 'error');
            setPulsingAnimation(false);
            startButton.disabled = false;
            stopButton.disabled = true;
        }
        else if (message.action === 'downloadStarted') {
            // Download started
            updateStatus(`CSV download initiated: ${message.filename}`, 'success');
            setPulsingAnimation(false);
        }
        else if (message.action === 'statusUpdate') {
            // General status updates
            updateStatus(message.message, 'progress');
        }
    });

    // Add a keyframe animation for pulsing effect
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
});