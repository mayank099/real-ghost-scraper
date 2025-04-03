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
    
    // Check scraping status when popup opens
    checkScrapingStatus();

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

    // Keep track of current phase
    let currentPhase = '';
    
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
            
            // Reset current phase
            currentPhase = '';
        }
        else if (message.action === 'urlCollectionProgress') {
            // Only update UI if we're changing phase or progress increased
            if (currentPhase !== 'url_collection' || message.currentPage > parseInt(progressBar.getAttribute('data-current') || 0)) {
                currentPhase = 'url_collection';
                
                // Update progress status for URL collection
                updateStatus(`Collecting URLs from page ${message.currentPage} of ${message.totalPages}`, 'progress');
    
                // Always update progress incrementally
                updateProgress(message.currentPage, message.totalPages);
                progressBar.setAttribute('data-current', message.currentPage);
            }
        }
        else if (message.action === 'detailProgress') {
            // Only update UI if we're changing phase or progress increased
            if (message.overallProgress && message.overallProgress.total > 0) {
                const current = message.overallProgress.current;
                const total = message.overallProgress.total;
                
                if (currentPhase !== 'detail_scraping' || current > parseInt(progressBar.getAttribute('data-current') || 0)) {
                    currentPhase = 'detail_scraping';
                    
                    // Update progress for detail page scraping
                    updateStatus(`Visiting property: ${current} of ${total}`, 'progress');
                    
                    // Always update progress incrementally
                    updateProgress(current, total);
                    progressBar.setAttribute('data-current', current);
                }
            }
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
        else if (message.action === 'enableDownload') {
            // Enable download button after stopping scraping
            downloadButton.disabled = false;
            updateStatus('Scraping stopped. Ready to download CSV.', 'warning');
        }
        else if (message.action === 'disableDownload') {
            // Disable download button when there's no data
            downloadButton.disabled = true;
        }
        else if (message.action === 'resetUI') {
            // Reset UI state completely
            startButton.disabled = false;
            stopButton.disabled = true;
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            setPulsingAnimation(false);
            updateStatus('Scraping stopped', 'warning');
            // Reset tracking variables
            currentPhase = '';
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
    
    // Function to check the current scraping status from the background script
    function checkScrapingStatus() {
        chrome.runtime.sendMessage({ action: 'getScrapingStatus' }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("Error getting scraping status:", chrome.runtime.lastError);
                return;
            }
            
            if (response && response.isProcessing) {
                // Scraping is in progress
                startButton.disabled = true;
                stopButton.disabled = false;
                downloadButton.disabled = true;
                updateStatus('Scraping in progress...', 'progress');
                setPulsingAnimation(true);
                
                // Show progress if available
                if (response.progress) {
                    progressContainer.style.display = 'block';
                    const percentage = (response.progress.current / response.progress.total) * 100;
                    progressBar.style.width = `${percentage}%`;
                    updateStatus(`Visiting property: ${response.progress.current} of ${response.progress.total}`, 'progress');
                }
            } else if (response && response.hasData) {
                // Scraping is not in progress but there's data available for download
                startButton.disabled = false;
                stopButton.disabled = true;
                downloadButton.disabled = false;
                updateStatus('Ready to download data', 'success');
            }
        });
    }
});