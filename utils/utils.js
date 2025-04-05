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

// Export the utility functions
export { cleanText };