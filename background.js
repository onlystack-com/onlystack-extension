// Background service worker for Chrome extension
console.log('Background script loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default values on installation
    chrome.storage.sync.set({
      extensionData: {
        installDate: Date.now(),
        version: '1.0.0'
      }
    });
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received:', request);
  
  switch (request.action) {
    case 'buttonClicked':
      console.log('Button clicked at:', request.timestamp);
      sendResponse({success: true, message: 'Button click processed'});
      break;
      
    case 'contentScriptMessage':
      console.log('Content script message:', request.data);
      sendResponse({success: true, message: 'Content script message processed'});
      break;
      
    case 'getCookie':
      chrome.cookies.getAll({
        url: request.url
      }, function(allCookies) {
        const targetCookie = allCookies.find(cookie => cookie.name === request.cookieName);
        
        if (targetCookie) {
          sendResponse({success: true, value: targetCookie.value, cookie: targetCookie, allCookies: allCookies});
        } else {
          sendResponse({success: false, message: 'Cookie not found', allCookies: allCookies});
        }
      });
      return true; // Keep message channel open for async response
      
    default:
      console.log('Unknown action:', request.action);
      sendResponse({success: false, message: 'Unknown action'});
  }
  
  return true; // Keep message channel open for async response
});

// Handle tab updates
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('Tab updated:', tab.url);
    
    // You can add custom logic here for specific URLs
    if (tab.url.includes('example.com')) {
      console.log('User visited example.com');
    }
  }
});

// Handle browser action (extension icon) clicks
chrome.action.onClicked.addListener(function(tab) {
  console.log('Extension icon clicked on tab:', tab.id);
  
  // Send message to content script
  chrome.tabs.sendMessage(tab.id, {
    action: 'iconClicked',
    tabId: tab.id
  });
});

// Utility function to get current tab
async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

// Example of periodic background task
setInterval(function() {
  console.log('Background heartbeat:', new Date().toISOString());
}, 60000); // Every minute
