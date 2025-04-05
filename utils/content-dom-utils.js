// Function to observe DOM changes
export function observeDOMChanges(targetNode, config, callback) {
    const observer = new MutationObserver((mutations, observer) => {
        callback(mutations, observer);
    });

    observer.observe(targetNode, config || {
        childList: true,
        subtree: true,
        attributes: true
    });

    return observer;
}

// Function to wait for element to be present in DOM
export function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver((mutations) => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Set timeout
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

// Function to safely get computed style
export function getComputedStyle(element, property) {
    try {
        return window.getComputedStyle(element)[property];
    } catch (error) {
        console.error(`Error getting computed style for ${property}:`, error);
        return null;
    }
}

// Function to check if element is visible
export function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
}

// Function to find closest parent matching selector
export function findClosestParent(element, selector) {
    while (element) {
        if (element.matches(selector)) return element;
        element = element.parentElement;
    }
    return null;
}

// Function to get all elements matching selector within a container
export function findAll(selector, container = document) {
    try {
        return Array.from(container.querySelectorAll(selector));
    } catch (error) {
        console.error(`Error finding elements with selector ${selector}:`, error);
        return [];
    }
}

// Function to safely get element attribute
export function getAttribute(element, attribute) {
    try {
        return element.getAttribute(attribute) || '';
    } catch (error) {
        console.error(`Error getting attribute ${attribute}:`, error);
        return '';
    }
}

// Function to check if element matches any of the selectors
export function matchesAny(element, selectors) {
    return selectors.some(selector => {
        try {
            return element.matches(selector);
        } catch (error) {
            console.error(`Invalid selector: ${selector}`, error);
            return false;
        }
    });
}

// Function to wait for multiple elements
export function waitForElements(selectors, timeout = 10000) {
    return Promise.all(
        selectors.map(selector => waitForElement(selector, timeout))
    );
}

// Function to observe specific elements
export function observeElements(selector, callback, config = {}) {
    const elements = document.querySelectorAll(selector);
    const observers = [];

    elements.forEach(element => {
        const observer = new MutationObserver((mutations) => {
            callback(mutations, element);
        });

        observer.observe(element, {
            attributes: true,
            childList: true,
            subtree: true,
            ...config
        });

        observers.push(observer);
    });

    return {
        disconnect: () => observers.forEach(o => o.disconnect()),
        observers
    };
}

// Function to detect infinite scroll
export function detectInfiniteScroll(callback, options = {}) {
    const {
        threshold = 100,
        debounceTime = 100
    } = options;

    let timeout;
    let isProcessing = false;

    function handleScroll() {
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            if (isProcessing) return;

            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY;
            const clientHeight = window.innerHeight;

            if (scrollHeight - scrollTop - clientHeight < threshold) {
                isProcessing = true;
                Promise.resolve(callback()).finally(() => {
                    isProcessing = false;
                });
            }
        }, debounceTime);
    }

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
}

// Function to handle dynamic content loading
export function handleDynamicContent(targetNode, onNewContent, config = {}) {
    const defaultConfig = {
        childList: true,
        subtree: true,
        attributes: false
    };

    const observer = new MutationObserver((mutations) => {
        const hasNewContent = mutations.some(mutation => {
            return mutation.type === 'childList' && mutation.addedNodes.length > 0;
        });

        if (hasNewContent) {
            onNewContent(mutations);
        }
    });

    observer.observe(targetNode, { ...defaultConfig, ...config });
    return observer;
}

// Function to detect AJAX navigation
export function detectAjaxNavigation(callback) {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function () {
        originalPushState.apply(this, arguments);
        callback('pushState', arguments[2]);
    };

    window.history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        callback('replaceState', arguments[2]);
    };

    window.addEventListener('popstate', () => {
        callback('popstate', window.location.href);
    });

    return () => {
        window.history.pushState = originalPushState;
        window.history.replaceState = originalReplaceState;
    };
}
