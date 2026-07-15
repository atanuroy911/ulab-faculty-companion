// background.js — service worker for ULAB Faculty Companion

// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Faculty Companion]', error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/time/results.html') });
    } else if (request.action === 'openAdvisingResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/advising/results.html') });
    } else if (request.action === 'openBulkSaveResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/bulk-save/results.html') });
    } else if (request.action === 'openCatalogueViewer') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/catalogue-viewer/viewer.html') });
    }
});
