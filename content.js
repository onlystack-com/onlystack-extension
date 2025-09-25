// Content script for Chrome extension

// Feature flags
const ENABLE_CHAT_HEADER_SPENT = false;

// SHA1 hash function for browser
function sha1(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  return crypto.subtle.digest('SHA-1', dataBuffer).then(hashBuffer => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  });
}

// Sign request function (async version for browser)
async function signRequest(fullUrl, userId, timestamp, dynamicRules) {
  const time = timestamp || +new Date();
  const url = new URL(fullUrl);
  const msg = [
    dynamicRules["static_param"],
    time,
    url.pathname + url.search,
    userId || 0
  ].join("\n");
  
  const shaHash = await sha1(msg);
  const hashAscii = Array.from(shaHash).map(char => char.charCodeAt(0));

  const checksum = dynamicRules["checksum_indexes"].reduce((result, value) => result + hashAscii[value], 0) + dynamicRules["checksum_constant"];
  const sign = [dynamicRules["start"], shaHash, Math.abs(checksum).toString(16), dynamicRules["end"]].join(":");
  
  return { sign, time };
}

// Check if we're on OnlyFans chat page and extract user ID
function checkOnlyFansChatPage() {
  const url = window.location.href;
  const chatPattern = /https:\/\/onlyfans\.com\/my\/chats\/chat\/(\d+)\//;
  const match = url.match(chatPattern);
  
  if (match) {
    const userId = match[1];
    return userId;
  }
  
  return null;
}

// Get auth_id cookie value with retry mechanism
async function getAuthIdCookie(maxRetries = 5, delay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    
    // Method 1: Try document.cookie
    const cookies = document.cookie.split(';');
    
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'auth_id') {
        return value;
      }
    }
    
    // Method 2: Try Chrome cookies API if available
    try {
      if (chrome && chrome.cookies) {
        const result = await new Promise((resolve) => {
          chrome.cookies.get({
            url: 'https://onlyfans.com',
            name: 'auth_id'
          }, (cookie) => {
            resolve(cookie);
          });
        });
        
        if (result && result.value) {
          return result.value;
        }
      }
    } catch (e) {
      // Chrome cookies API not available in content script
    }
    
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

// Generate signature for OnlyFans request
async function generateOnlyFansSignature(chatUserId) {
  try {
    
    // Get current timestamp
    const timestamp = +new Date();
    
    // Generate API URL
    const apiUrl = `https://onlyfans.com/api2/v2/users/u${chatUserId}`;
    
    // Get auth_id from cookies with retry mechanism
    const authId = await getAuthIdCookie();
    if (!authId) {
      return;
    }
    
    // Get dynamic rules from storage or fetch them
    const dynamicRules = await getDynamicRules();
    if (!dynamicRules) {
      return;
    }
    
    // Generate signature
    const result = await signRequest(apiUrl, authId, timestamp, dynamicRules);
    
    return result;
    
  } catch (error) {
    // Error generating signature
  }
}

// Get dynamic rules from extension storage
async function getDynamicRules() {
  try {
    // Get from extension storage
    const result = await chrome.storage.sync.get(['dynamicRules']);
    
    if (result.dynamicRules && result.dynamicRules.rules) {
      return result.dynamicRules.rules;
    }
    
    // If no rules in storage, return null
    return null;
    
  } catch (error) {
    return null;
  }
}

// Check if we're on OnlyFans chat page
function isOnlyFansChatPage() {
  return window.location.href.includes('https://onlyfans.com/my/chats/chat/');
}

// Function to add custom button to OnlyFans chat actions
function addCustomButtonToChat() {
  if (!isOnlyFansChatPage()) {
    return;
  }

  // Look for the specific element with class b-make-post__actions
  const actionsElement = document.querySelector('.b-make-post__actions');
  
  if (actionsElement && !document.querySelector('#only-software-custom-btn')) {
    // Find the buttons container
    const buttonsContainer = actionsElement.querySelector('.b-make-post__actions__btns');
    
    if (buttonsContainer) {
      // Create our custom button
      const customButton = document.createElement('button');
      customButton.id = 'only-software-custom-btn';
      customButton.type = 'button';
      customButton.className = 'g-btn m-with-round-hover m-icon m-icon-only m-gray m-sm-size has-tooltip';
      customButton.setAttribute('data-original-title', 'Only Software');
      customButton.setAttribute('aria-label', 'Only Software Tool');
      
      // Add emoji icon
      customButton.innerHTML = `
        <span style="font-size: 16px;">😊</span>
      `;
      
      // Add click handler to open emoji selector
      customButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleEmojiSelector(customButton);
      });
      
      // Insert the button at the end of the buttons container
      buttonsContainer.appendChild(customButton);
    }
  }
}

// Add quick emoji buttons as the first child inside #make_post_form
function addQuickEmojiButtonsToForm(retryCount = 0) {
  if (!isOnlyFansChatPage()) {
    return;
  }

  const maxRetries = 10;
  const form = document.getElementById('make_post_form');

  if (!form) {
    if (retryCount < maxRetries) {
      setTimeout(() => addQuickEmojiButtonsToForm(retryCount + 1), 200);
    }
    return;
  }

  // Avoid duplicates
  if (form.querySelector('.only-software-quick-emoji-container')) {
    return;
  }

  const container = document.createElement('div');
  container.className = 'only-software-quick-emoji-container';
  container.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  `;

  const emojis = ['🥵', '🥺', '😢'];
  emojis.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.style.cssText = `
      border: none;
      background: #f2f3f5;
      font-size: 18px;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
      line-height: 1;
    `;

    btn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#e8e9eb';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#f2f3f5';
    });
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      insertEmojiIntoChat(emoji);
    });

    container.appendChild(btn);
  });

  // Insert as the first child of the form
  if (form.firstChild) {
    form.insertBefore(container, form.firstChild);
  } else {
    form.appendChild(container);
  }
}

// Emoji selector functionality with comprehensive library
function createEmojiSelector() {
  const selector = document.createElement('div');
  selector.id = 'only-software-emoji-selector';
  selector.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    z-index: 10000;
    display: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 350px;
    max-height: 400px;
  `;

  // Create category tabs
  const tabsContainer = document.createElement('div');
  tabsContainer.style.cssText = `
    display: flex;
    border-bottom: 1px solid #eee;
    background: #f8f9fa;
    border-radius: 12px 12px 0 0;
    overflow-x: auto;
  `;

  // Create content area
  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    padding: 12px;
    max-height: 320px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  `;

  const categories = Object.keys(EMOJI_DATA);
  const categoryIcons = {
    'Smileys & People': '😊',
    'Animals & Nature': '🐶',
    'Food & Drink': '🍎',
    'Activities & Sports': '⚽',
    'Travel & Places': '🚗',
    'Objects': '💡',
    'Symbols & Flags': '❤️'
  };

  let currentCategory = categories[0];

  // Create tabs
  categories.forEach((category, index) => {
    const tab = document.createElement('button');
    tab.textContent = categoryIcons[category] || '📁';
    tab.title = category;
    tab.style.cssText = `
      border: none;
      background: ${index === 0 ? '#007bff' : 'transparent'};
      color: ${index === 0 ? 'white' : '#666'};
      padding: 10px 12px;
      cursor: pointer;
      font-size: 18px;
      transition: all 0.2s;
      border-radius: 0;
      min-width: 44px;
    `;

    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Update tab styles
      tabsContainer.querySelectorAll('button').forEach(t => {
        t.style.background = 'transparent';
        t.style.color = '#666';
      });
      tab.style.background = '#007bff';
      tab.style.color = 'white';
      
      // Update content
      currentCategory = category;
      updateEmojiContent(contentArea, category);
    });

    tabsContainer.appendChild(tab);
  });

  // Initial content
  updateEmojiContent(contentArea, currentCategory);

  selector.appendChild(tabsContainer);
  selector.appendChild(contentArea);

  return selector;
}

function updateEmojiContent(contentArea, category) {
  contentArea.innerHTML = '';
  
  const emojis = EMOJI_DATA[category] || [];
  
  emojis.forEach(emoji => {
    const emojiButton = document.createElement('button');
    emojiButton.textContent = emoji;
    emojiButton.style.cssText = `
      border: none;
      background: none;
      font-size: 24px;
      padding: 8px;
      cursor: pointer;
      border-radius: 6px;
      transition: background-color 0.2s;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    emojiButton.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#f0f0f0';
    });
    
    emojiButton.addEventListener('mouseleave', function() {
      this.style.backgroundColor = 'transparent';
    });
    
    emojiButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      insertEmojiIntoChat(emoji);
      hideEmojiSelector();
    });
    
    contentArea.appendChild(emojiButton);
  });
}

function toggleEmojiSelector(buttonElement) {
  let selector = document.getElementById('only-software-emoji-selector');
  
  if (selector && selector.style.display !== 'none') {
    hideEmojiSelector();
    return;
  }
  
  if (!selector) {
    selector = createEmojiSelector();
    document.body.appendChild(selector);
  }
  
  // Position the selector near the button
  const buttonRect = buttonElement.getBoundingClientRect();
  selector.style.position = 'fixed';
  
  // Calculate optimal position
  const selectorHeight = 400;
  const selectorWidth = 350;
  
  // Try to position above the button first
  let top = buttonRect.top - selectorHeight - 10;
  let left = buttonRect.left;
  
  // If it would go off the top of the screen, position below
  if (top < 10) {
    top = buttonRect.bottom + 10;
  }
  
  // If it would go off the right side, adjust left position
  if (left + selectorWidth > window.innerWidth - 10) {
    left = window.innerWidth - selectorWidth - 10;
  }
  
  // If it would go off the left side, adjust left position
  if (left < 10) {
    left = 10;
  }
  
  selector.style.top = top + 'px';
  selector.style.left = left + 'px';
  selector.style.display = 'block';
  
  // Close selector when clicking outside
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

function hideEmojiSelector() {
  const selector = document.getElementById('only-software-emoji-selector');
  if (selector) {
    selector.style.display = 'none';
  }
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  const selector = document.getElementById('only-software-emoji-selector');
  const button = document.getElementById('only-software-custom-btn');
  
  if (selector && !selector.contains(e.target) && !button.contains(e.target)) {
    hideEmojiSelector();
  }
}

function insertEmojiIntoChat(emoji) {
  // Find the chat input field - OnlyFans typically uses a contenteditable div
  const chatInput = document.querySelector('[contenteditable="true"]') || 
                   document.querySelector('textarea') ||
                   document.querySelector('input[type="text"]');
  
  if (chatInput) {
    chatInput.focus();
    
    if (chatInput.contentEditable === 'true') {
      // For contenteditable divs - use execCommand for better compatibility
      const selection = window.getSelection();
      
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Check if the cursor is inside the input field
        if (chatInput.contains(range.commonAncestorContainer)) {
          // Try execCommand first, fallback to manual insertion
          if (!document.execCommand('insertText', false, emoji)) {
            // Fallback for browsers that don't support execCommand
            range.deleteContents();
            const emojiNode = document.createTextNode(emoji);
            range.insertNode(emojiNode);
            range.setStartAfter(emojiNode);
            range.setEndAfter(emojiNode);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else {
          // If cursor is not in the input, place it at the end
          const range = document.createRange();
          const textNode = chatInput.lastChild;
          
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            range.setStart(textNode, textNode.textContent.length);
          } else {
            range.selectNodeContents(chatInput);
            range.collapse(false);
          }
          
          selection.removeAllRanges();
          selection.addRange(range);
          if (!document.execCommand('insertText', false, emoji)) {
            // Fallback method
            const emojiNode = document.createTextNode(emoji);
            range.insertNode(emojiNode);
            range.setStartAfter(emojiNode);
            range.setEndAfter(emojiNode);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } else {
        // No selection, place cursor at end and insert
        const range = document.createRange();
        range.selectNodeContents(chatInput);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        if (!document.execCommand('insertText', false, emoji)) {
          // Fallback method
          const emojiNode = document.createTextNode(emoji);
          range.insertNode(emojiNode);
          range.setStartAfter(emojiNode);
          range.setEndAfter(emojiNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      
      // Trigger input events to notify OnlyFans
      chatInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      chatInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
    } else {
      // For regular input/textarea elements
      const currentValue = chatInput.value;
      const cursorPos = chatInput.selectionStart || 0;
      const selectionEnd = chatInput.selectionEnd || cursorPos;
      
      const newValue = currentValue.slice(0, cursorPos) + emoji + currentValue.slice(selectionEnd);
      chatInput.value = newValue;
      
      // Set cursor position after the inserted emoji
      const newCursorPos = cursorPos + emoji.length;
      chatInput.setSelectionRange(newCursorPos, newCursorPos);
      
      // Trigger input events
      chatInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      chatInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  } else {
    // Chat input not found
  }
}

// Initialize when DOM is ready
function initializeOnlyFansFeatures() {
  if (isOnlyFansChatPage()) {
    addCustomButtonToChat();
    addQuickEmojiButtonsToForm();
  }
}

// Listen for messages from background script and popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  
  switch (request.action) {
    case 'iconClicked':
      showNotification('Extension icon was clicked!');
      sendResponse({success: true, message: 'Icon click handled'});
      break;
      
    case 'highlightElements':
      highlightAllLinks();
      sendResponse({success: true, message: 'Elements highlighted'});
      break;
      
    case 'getPageInfo':
      const pageInfo = {
        title: document.title,
        url: window.location.href,
        linkCount: document.links.length,
        imageCount: document.images.length
      };
      sendResponse({success: true, data: pageInfo});
      break;
      
    default:
      sendResponse({success: false, message: 'Unknown action'});
  }
  
  return true; // Keep message channel open for async response
});

// Function to show a notification on the page
function showNotification(message) {
  // Remove existing notification if any
  const existingNotification = document.getElementById('chrome-ext-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'chrome-ext-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #4285f4;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(function() {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Function to highlight all links on the page
function highlightAllLinks() {
  const links = document.querySelectorAll('a');
  links.forEach(function(link) {
    link.style.outline = '2px solid #ff6b6b';
    link.style.outlineOffset = '2px';
  });
  
  // Remove highlighting after 5 seconds
  setTimeout(function() {
    links.forEach(function(link) {
      link.style.outline = '';
      link.style.outlineOffset = '';
    });
  }, 5000);
}

// Initialize OnlyFans features when page loads
window.addEventListener('load', function() {
  initializeOnlyFansFeatures();
  checkAndGenerateSignature();
  initializeTimezoneWidget(); // Add timezone widget to all pages
  initializeListSpendBadges();
  
  chrome.runtime.sendMessage({
    action: 'contentScriptMessage',
    data: {
      url: window.location.href,
      title: document.title,
      loadTime: Date.now()
    }
  });
});

// Get auth_id cookie from background script
async function getAuthIdFromBackground() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'getCookie',
        cookieName: 'auth_id',
        url: 'https://onlyfans.com'
      }, (response) => {
        resolve(response);
      });
    });
    
    if (response && response.allCookies) {
      const authCookie = response.allCookies.find(c => c.name === 'auth_id');
      if (authCookie) {
        return authCookie.value;
      }
    }
  } catch (error) {
    return null;
  }
  
  return null;
}

// Track if signature has been generated for current page
let signatureGenerated = false;
let currentChatUserId = null;

// Check for chat page and generate signature
function checkAndGenerateSignature(delay = 500) {
  const chatUserId = checkOnlyFansChatPage();
  if (chatUserId && (chatUserId !== currentChatUserId || !signatureGenerated)) {
    // Reset flag if we're on a different chat page
    if (chatUserId !== currentChatUserId) {
      signatureGenerated = false;
      currentChatUserId = chatUserId;
        // Show loading indicator for new chat
      showLoadingIndicator();
    }
    
    if (!signatureGenerated) {
      signatureGenerated = true;
      setTimeout(() => {
        getAuthIdFromBackground().then(authId => {
          if (authId) {
            generateSignatureWithAuthId(chatUserId, authId);
          }
        });
      }, delay);
    }
  }
}

// Show loading indicator while fetching data
function showLoadingIndicator() {
  if (!ENABLE_CHAT_HEADER_SPENT) return;
  // Use the same retry mechanism to ensure DOM is ready
  const maxRetries = 10;
  
  function tryShowLoading(retryCount = 0) {
    if (retryCount >= maxRetries) return;
    
    // Find the h1 element with at-attr="page_title"
    const titleElement = document.querySelector('h1[at-attr="page_title"]');
    
    if (!titleElement) {
      setTimeout(() => tryShowLoading(retryCount + 1), 100);
      return;
    }
    
    // Check if we already have a spent display element
    let spentElement = document.querySelector('.only-software-spent-display');
    
    if (spentElement) {
      // Update existing element to show loading
      spentElement.textContent = 'TOTAL SPENT: ...';
    } else {
      // Create new loading element
      spentElement = document.createElement('div');
      spentElement.className = 'only-software-spent-display';
      spentElement.style.cssText = `
        font-weight: bold;
        color: #000000;
        font-size: 16px;
        margin-top: 8px;
        padding: 5px 0;
      `;
      spentElement.textContent = 'TOTAL SPENT: ...';
      
      // Insert after the h1 element
      titleElement.insertAdjacentElement('afterend', spentElement);
    }
  }
  
  tryShowLoading();
}

// Simplified signature generation with known auth_id
async function generateSignatureWithAuthId(chatUserId, authId) {
  try {
    const timestamp = +new Date();
    const apiUrl = `https://onlyfans.com/api2/v2/users/u${chatUserId}`;
    
    const dynamicRules = await getDynamicRules();
    if (!dynamicRules) {
      return;
    }
    
    const result = await signRequest(apiUrl, authId, timestamp, dynamicRules);
    
    // After signature is generated, get X-Hash
    const xHash = await getXHash(authId);
    
    // Make the final API request with all headers
    if (xHash) {
      await makeApiRequest(apiUrl, result.sign, result.time, authId, xHash);
    }
    
    return result;
    
  } catch (error) {
    // Error generating signature
  }
}

// Get X-Hash after signature is generated
async function getXHash(authId) {
  try {
    const hashUrl = `https://cdn2.onlyfans.com/hash/?u=${authId}`;
    const hashResponse = await fetch(hashUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://onlyfans.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      }
      // Removed credentials: 'include' to avoid CORS issue
    });
    
    if (hashResponse.ok) {
      const xHash = await hashResponse.text();
      return xHash.trim();
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

// Get fp cookie value for X-BC header
async function getFpCookie() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'getCookie',
        cookieName: 'fp',
        url: 'https://onlyfans.com'
      }, (response) => {
        resolve(response);
      });
    });
    
    if (response && response.allCookies) {
      const fpCookie = response.allCookies.find(c => c.name === 'fp');
      if (fpCookie) {
        return fpCookie.value;
      }
    }
  } catch (error) {
    return null;
  }
  
  return null;
}

// Modular API request function for OnlyFans endpoints
async function makeOnlyFansApiRequest(apiUrl, authId) {
  try {
    // Get current timestamp
    const timestamp = +new Date();
    
    // Get dynamic rules from storage
    const dynamicRules = await getDynamicRules();
    if (!dynamicRules) {
      return null;
    }
    
    // Generate signature
    const result = await signRequest(apiUrl, authId, timestamp, dynamicRules);
    if (!result) {
      return null;
    }
    
    // Get X-Hash
    const xHash = await getXHash(authId);
    if (!xHash) {
      return null;
    }
    
    // Get fp cookie for X-BC header
    const fpValue = await getFpCookie();
    if (!fpValue) {
      return null;
    }

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'App-Token': '33d57ade8c02dbc5a333db99ff9ae26a',
      'Priority': 'u=1, i',
      'Referer': 'https://onlyfans.com/',
      'Sec-CH-UA': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Sign': result.sign,
      'Time': result.time.toString(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'User-ID': authId,
      'X-BC': fpValue,
      'X-Hash': xHash,
      'X-OF-Rev': '202410311'
    };

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: headers,
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      return null;
    }
    
  } catch (error) {
    return null;
  }
}

// Make the final API request with all headers (legacy function for total spent)
async function makeApiRequest(apiUrl, sign, time, authId, xHash) {
  try {
    const fpValue = await getFpCookie();
    if (!fpValue) {
      return;
    }

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'App-Token': '33d57ade8c02dbc5a333db99ff9ae26a',
      'Priority': 'u=1, i',
      'Referer': 'https://onlyfans.com/',
      'Sec-CH-UA': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Sign': sign,
      'Time': time.toString(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'User-ID': authId,
      'X-BC': fpValue,
      'X-Hash': xHash,
      'X-OF-Rev': '202410311'
    };

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: headers,
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      const totalSumm = extractTotalSumm(data);
      
      // Add total spent to DOM
      if (totalSumm !== null && totalSumm !== undefined) {
        addTotalSpentToDOM(totalSumm);
      }
    }
    
  } catch (error) {
    // Error making API request
  }
}

// Get online subscribers count
async function getOnlineSubscribersCount() {
  try {
    // Get auth_id from background script
    const authId = await getAuthIdFromBackground();
    if (!authId) {
      return null;
    }

    // API endpoint for online subscribers
    const apiUrl = 'https://onlyfans.com/api2/v2/subscriptions/subscribers?limit=10&offset=0&format=infinite&type=active&filter[online]=1&more=false';
    
    // Make the API request using our modular function
    const data = await makeOnlyFansApiRequest(apiUrl, authId);
    
    if (data && data.list) {
      // Double verification using lastSeen within 2 minutes
      const filtered = await filterUsersByRecentLastSeen(data.list, 2);
      return filtered.length;
    } else {
      return null;
    }
    
  } catch (error) {
    return null;
  }
}

// Fetch the current list of online subscribers (returns array of user objects)
async function getOnlineSubscribersList() {
  try {
    const authId = await getAuthIdFromBackground();
    if (!authId) {
      return [];
    }

    const apiUrl = 'https://onlyfans.com/api2/v2/subscriptions/subscribers?limit=50&offset=0&format=infinite&type=active&filter[online]=1&more=false';
    const data = await makeOnlyFansApiRequest(apiUrl, authId);
    if (data && Array.isArray(data.list)) {
      // Double verification using lastSeen within 2 minutes
      const filtered = await filterUsersByRecentLastSeen(data.list, 2);
      return filtered;
    }
    return [];
  } catch (error) {
    return [];
  }
}

// =============================
// Online users lastSeen helpers
// =============================

let userLastSeenCache = new Map();
let inflightLastSeenRequests = new Map();

async function getUserLastSeen(userId) {
  try {
    const key = String(userId);
    if (userLastSeenCache.has(key)) {
      return userLastSeenCache.get(key);
    }
    if (inflightLastSeenRequests.has(key)) {
      return await inflightLastSeenRequests.get(key);
    }

    const promise = (async () => {
      const authId = await getAuthIdFromBackground();
      if (!authId) throw new Error('no-auth');
      const apiUrl = `https://onlyfans.com/api2/v2/users/u${key}`;
      const data = await makeOnlyFansApiRequest(apiUrl, authId);
      const lastSeen = (data && data.lastSeen) ? String(data.lastSeen) : null;
      userLastSeenCache.set(key, lastSeen);
      inflightLastSeenRequests.delete(key);
      return lastSeen;
    })();

    inflightLastSeenRequests.set(key, promise);
    return await promise;
  } catch (e) {
    return null;
  }
}

function isLastSeenWithinMinutes(lastSeenIso, minutes) {
  try {
    if (!lastSeenIso) return false;
    const lastSeenTime = new Date(lastSeenIso).getTime();
    if (!Number.isFinite(lastSeenTime)) return false;
    const now = Date.now();
    const diffMs = Math.abs(now - lastSeenTime);
    return diffMs <= minutes * 60 * 1000;
  } catch (e) {
    return false;
  }
}

async function filterUsersByRecentLastSeen(users, minutes = 2) {
  try {
    if (!Array.isArray(users) || users.length === 0) return [];

    // Limit concurrency to avoid too many parallel requests
    const concurrency = 10;
    const results = [];

    for (let i = 0; i < users.length; i += concurrency) {
      const batch = users.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(async (user) => {
        const userId = user && (user.id || user.user_id || user.uid);
        if (!userId) return null;
        const lastSeen = await getUserLastSeen(userId);
        if (isLastSeenWithinMinutes(lastSeen, minutes)) {
          return user;
        }
        return null;
      }));
      for (const r of batchResults) {
        if (r) results.push(r);
      }
    }

    return results;
  } catch (e) {
    return [];
  }
}

// Floating overlay for online users menu
let onlineUsersMenuEl = null;
let onlineUsersMenuAnchorEl = null;
let onlineUsersMenuHandlers = { onDocClick: null, onKeyDown: null, onResizeScroll: null };

function closeOnlineUsersMenu() {
  try {
    if (onlineUsersMenuEl && onlineUsersMenuEl.parentNode) {
      onlineUsersMenuEl.parentNode.removeChild(onlineUsersMenuEl);
    }
    onlineUsersMenuEl = null;
    if (onlineUsersMenuHandlers.onDocClick) {
      document.removeEventListener('click', onlineUsersMenuHandlers.onDocClick, true);
    }
    if (onlineUsersMenuHandlers.onKeyDown) {
      document.removeEventListener('keydown', onlineUsersMenuHandlers.onKeyDown, true);
    }
    if (onlineUsersMenuHandlers.onResizeScroll) {
      window.removeEventListener('resize', onlineUsersMenuHandlers.onResizeScroll);
      window.removeEventListener('scroll', onlineUsersMenuHandlers.onResizeScroll, true);
    }
    onlineUsersMenuHandlers = { onDocClick: null, onKeyDown: null, onResizeScroll: null };
    onlineUsersMenuAnchorEl = null;
  } catch (e) {}
}

function positionOnlineUsersMenu(anchorEl) {
  if (!onlineUsersMenuEl || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const panel = onlineUsersMenuEl;
  const margin = 8;
  const maxWidth = Math.min(320, window.innerWidth - 2 * margin);

  panel.style.maxWidth = maxWidth + 'px';
  panel.style.visibility = 'hidden';
  panel.style.left = '0px';
  panel.style.top = '0px';
  
  // Force layout to measure size
  document.body.appendChild(panel);
  const panelWidth = panel.offsetWidth || maxWidth;
  const panelHeight = panel.offsetHeight || 200;
  
  let left = Math.min(Math.max(rect.left, margin), window.innerWidth - panelWidth - margin);
  let top = rect.bottom + margin;
  if (top + panelHeight > window.innerHeight - margin) {
    // Try placing above if not enough space below
    const aboveTop = rect.top - margin - panelHeight;
    if (aboveTop > margin) {
      top = aboveTop;
    } else {
      top = Math.max(margin, window.innerHeight - panelHeight - margin);
    }
  }
  
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.visibility = 'visible';
}

function openOnlineUsersMenu(users, anchorEl, options = {}) {
  try {
    // If already open, just rebuild content and reposition
    if (!onlineUsersMenuEl) {
      const panel = document.createElement('div');
      panel.id = 'only-software-online-users-menu';
      panel.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        background: #ffffff;
        color: #222;
        border: 1px solid rgba(0,0,0,0.08);
        box-shadow: 0 10px 28px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.12);
        border-radius: 10px;
        padding: 10px;
        width: auto;
        max-width: 320px;
        max-height: 60vh;
        overflow: auto;
        backdrop-filter: saturate(120%) blur(0px);
      `;

      // Header with title and close
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      `;
      const title = document.createElement('div');
      title.textContent = 'Online users';
      title.style.cssText = 'font-weight: 700; font-size: 13px; color: #333;';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #666;
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      `;
      closeBtn.addEventListener('click', closeOnlineUsersMenu);
      header.appendChild(title);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // List container
      const list = document.createElement('div');
      list.className = 'only-software-online-users-list';
      list.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      `;
      panel.appendChild(list);

      onlineUsersMenuEl = panel;

      // Outside click and Escape handlers
      onlineUsersMenuHandlers.onDocClick = function(event) {
        if (!onlineUsersMenuEl) return;
        const clickedInsidePanel = onlineUsersMenuEl.contains(event.target);
        const clickedAnchor = !!(anchorEl && (event.target === anchorEl || anchorEl.contains(event.target)));
        if (!clickedInsidePanel && !clickedAnchor) {
          closeOnlineUsersMenu();
        }
      };
      onlineUsersMenuHandlers.onKeyDown = function(event) {
        if (event.key === 'Escape') {
          closeOnlineUsersMenu();
        }
      };
      onlineUsersMenuHandlers.onResizeScroll = function() {
        if (onlineUsersMenuEl && onlineUsersMenuAnchorEl) {
          positionOnlineUsersMenu(onlineUsersMenuAnchorEl);
        }
      };
      document.addEventListener('click', onlineUsersMenuHandlers.onDocClick, true);
      document.addEventListener('keydown', onlineUsersMenuHandlers.onKeyDown, true);
      window.addEventListener('resize', onlineUsersMenuHandlers.onResizeScroll);
      window.addEventListener('scroll', onlineUsersMenuHandlers.onResizeScroll, true);
    }

    // Rebuild list content
    const listEl = onlineUsersMenuEl.querySelector('.only-software-online-users-list');
    listEl.innerHTML = '';
    if (options && options.loading) {
      const loading = document.createElement('div');
      loading.textContent = 'Loading...';
      loading.style.cssText = 'color:#666; font-size:12px;';
      listEl.appendChild(loading);
    } else if (!users || users.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No users online right now';
      empty.style.cssText = 'color:#666; font-size:12px;';
      listEl.appendChild(empty);
    } else {
      users.forEach(user => {
        const userId = user && user.id;
        if (!userId) return;
        const link = document.createElement('a');
        link.href = `https://onlyfans.com/my/chats/chat/${userId}/`;
        const label = (user && (user.name || user.username)) ? (user.name || user.username) : String(userId);
        link.textContent = label;
        link.style.cssText = `
          background: #f7f7f8;
          color: #333;
          border: 1px solid #e5e5e5;
          padding: 5px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
        `;
        listEl.appendChild(link);
      });
    }

    // Attach and position
    if (!onlineUsersMenuEl.parentNode) {
      document.body.appendChild(onlineUsersMenuEl);
    }
    onlineUsersMenuAnchorEl = anchorEl || null;
    if (onlineUsersMenuAnchorEl) {
      positionOnlineUsersMenu(onlineUsersMenuAnchorEl);
    } else {
      // Fallback to top-right if no anchor provided
      onlineUsersMenuEl.style.left = (window.innerWidth - (onlineUsersMenuEl.offsetWidth || 320) - 12) + 'px';
      onlineUsersMenuEl.style.top = '12px';
    }
  } catch (e) {}
}

// Update online count in button
async function updateOnlineCount(buttonElement) {
  try {
    const onlineCount = await getOnlineSubscribersCount();
    
    if (onlineCount !== null) {
      buttonElement.textContent = `${onlineCount} Online right now`;
    } else {
      // Fallback to a reasonable default if API fails
      buttonElement.textContent = 'Online status unavailable';
    }
  } catch (error) {
    buttonElement.textContent = 'Online status error';
  }
}

// Get spending tier based on amount
function getSpendingTier(amount) {
  if (amount >= 500) {
    return "🐋 Whale";
  } else if (amount >= 100) {
    return "💰 Spender";
  } else if (amount >= 20) {
    return "💸 Supporter";
  } else if (amount > 0) {
    return "👤 Fan";
  } else {
    return "🆓 Free User";
  }
}

// Add total spent amount to the DOM (using retry mechanism like emoji button)
function addTotalSpentToDOM(totalSumm, retryCount = 0) {
  if (!ENABLE_CHAT_HEADER_SPENT) return;
  const maxRetries = 10;
  
  if (retryCount >= maxRetries) {
    return;
  }
  
  // Find the h1 element with at-attr="page_title"
  const titleElement = document.querySelector('h1[at-attr="page_title"]');
  
  if (!titleElement) {
    setTimeout(() => addTotalSpentToDOM(totalSumm, retryCount + 1), 200);
    return;
  }
  
  try {
    // Get spending tier
    const tier = getSpendingTier(totalSumm);
    
    // Check if we already added the spent element
    const existingSpent = document.querySelector('.only-software-spent-display');
    
    if (existingSpent) {
      // Update existing element
      existingSpent.innerHTML = `<strong>TOTAL SPENT: $${totalSumm}</strong> • ${tier}`;
    } else {
      // Create new spent display element
      const spentElement = document.createElement('div');
      spentElement.className = 'only-software-spent-display';
      spentElement.style.cssText = `
        font-weight: bold;
        color: #000000;
        font-size: 16px;
        margin-top: 8px;
        padding: 5px 0;
      `;
      spentElement.innerHTML = `<strong>TOTAL SPENT: $${totalSumm}</strong> • ${tier}`;
      
      // Insert after the h1 element
      titleElement.insertAdjacentElement('afterend', spentElement);
    }
    
  } catch (error) {
    // Error adding total spent to DOM
    // Retry on error
    setTimeout(() => addTotalSpentToDOM(totalSumm, retryCount + 1), 100);
  }
}

// =========================
// Per-list-item spend badges
// =========================

let userSpendCache = new Map();
let inflightSpendRequests = new Map();
let swipeoutObserver = null;

function extractTotalSumm(apiData) {
  try {
    if (!apiData) return null;
    // Primary: totalSumm at root or nested in subscribedOnData
    const raw = (apiData && apiData.totalSumm !== undefined) ? apiData.totalSumm
      : (apiData && apiData.subscribedOnData && apiData.subscribedOnData.totalSumm !== undefined)
        ? apiData.subscribedOnData.totalSumm
        : null;
    if (raw === null || raw === undefined) return null;
    const parsed = typeof raw === 'number' ? raw : Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function initializeListSpendBadges() {
  try {
    // Ensure globals exist
    if (!userSpendCache) userSpendCache = new Map();
    if (!inflightSpendRequests) inflightSpendRequests = new Map();

    // Initial scan
    processAllSwipeoutItems();

    // Observe future additions (infinite scroll)
    if (!swipeoutObserver) {
      swipeoutObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList' && mutation.addedNodes && mutation.addedNodes.length) {
            scanSwipeoutListItemsFromNodes(mutation.addedNodes);
          }
        });
      });
      swipeoutObserver.observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) {}
}

function processAllSwipeoutItems() {
  try {
    const items = document.querySelectorAll('.swipeout.swipeout-list-item');
    items.forEach((item) => {
      fetchAndRenderSpendForItem(item);
    });
  } catch (e) {}
}

function scanSwipeoutListItemsFromNodes(nodeList) {
  try {
    Array.from(nodeList).forEach((node) => {
      if (!(node instanceof Element)) return;

      if (node.matches && node.matches('.swipeout.swipeout-list-item')) {
        fetchAndRenderSpendForItem(node);
        return;
      }

      const descendants = node.querySelectorAll ? node.querySelectorAll('.swipeout.swipeout-list-item') : [];
      if (descendants && descendants.length) {
        descendants.forEach((el) => fetchAndRenderSpendForItem(el));
      }
    });
  } catch (e) {}
}

function fetchAndRenderSpendForItem(itemEl) {
  try {
    if (!itemEl || itemEl.__os_spendProcessed) {
      // We still allow updates if spend resolves later; the per-span update handles it
    }

    const userId = extractUserIdFromSwipeout(itemEl);
    if (!userId) {
      // Try to still add placeholders to usernames
      annotateItemUsernames(itemEl, null, { loading: false });
      return;
    }

    // Add loading placeholders
    annotateItemUsernames(itemEl, null, { loading: true });

    getUserSpend(userId)
      .then((spend) => {
        annotateItemUsernames(itemEl, spend, { loading: false });
        updateAvatarRingForItem(itemEl, spend);
      })
      .catch(() => {
        annotateItemUsernames(itemEl, null, { loading: false, error: true });
      });
  } catch (e) {}
}

function extractUserIdFromSwipeout(itemEl) {
  try {
    if (!itemEl) return null;
    const container = itemEl.querySelector('.swipeout-content') || itemEl;
    let idEl = container.querySelector('div div[id]') || container.querySelector('div[id]');
    if (!idEl || !idEl.id) return null;
    const match = String(idEl.id).match(/\d+/);
    if (!match) return null;
    return match[0];
  } catch (e) {
    return null;
  }
}

function annotateItemUsernames(itemEl, spendAmount, options = {}) {
  try {
    if (!itemEl) return;
    const spans = itemEl.querySelectorAll('span.g-user-username');
    if (!spans || !spans.length) return;

    let text = options && options.loading ? '...' : (options && options.error ? '—' : '');
    if (spendAmount !== null && spendAmount !== undefined && spendAmount !== '') {
      const amountNum = Number.parseFloat(spendAmount);
      if (Number.isFinite(amountNum)) {
        text = `$${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }

    spans.forEach((span) => {
      if (!span || !(span instanceof Element)) return;

      let badge = span.nextElementSibling && span.nextElementSibling.classList && span.nextElementSibling.classList.contains('only-software-spent-badge')
        ? span.nextElementSibling
        : null;

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'only-software-spent-badge';
        badge.style.cssText = 'display:inline-block; margin-left:6px; padding:1px 6px; border-radius:10px; background:#f2f3f5; color:#444; font-size:11px; font-weight:600; vertical-align:middle;';
        span.insertAdjacentElement('afterend', badge);
      }

      badge.textContent = text;
    });
  } catch (e) {}
}

async function getUserSpend(userId) {
  try {
    const key = String(userId);
    if (userSpendCache.has(key)) {
      return userSpendCache.get(key);
    }
    if (inflightSpendRequests.has(key)) {
      return inflightSpendRequests.get(key);
    }

    const promise = (async () => {
      const authId = await getAuthIdFromBackground();
      if (!authId) throw new Error('no-auth');
      const apiUrl = `https://onlyfans.com/api2/v2/users/u${key}`;
      const data = await makeOnlyFansApiRequest(apiUrl, authId);
      const spend = extractTotalSumm(data) ?? 0;
      userSpendCache.set(key, spend);
      inflightSpendRequests.delete(key);
      return spend;
    })();

    inflightSpendRequests.set(key, promise);
    return await promise;
  } catch (e) {
    return 0;
  }
}

function getAvatarRingColor(amount) {
  try {
    if (typeof amount !== 'number' || isNaN(amount)) return null;
    if (amount > 50) return '#dc3545'; // red
    if (amount >= 10) return '#ffc107'; // yellow
    return '#28a745'; // <10 green
  } catch (e) {
    return null;
  }
}

function updateAvatarRingForItem(itemEl, spendAmount) {
  try {
    if (!itemEl) return;
    const color = getAvatarRingColor(spendAmount);
    if (!color) return;
    const avatars = itemEl.querySelectorAll('.g-avatar__img-wrapper, .g-avatar__placeholder');
    if (!avatars || !avatars.length) return;
    avatars.forEach((av) => {
      if (!(av instanceof Element)) return;
      av.style.borderRadius = '50%';
      av.style.boxShadow = `0 0 0 4px ${color}`;
    });
  } catch (e) {}
}

// Also initialize when DOM is ready (in case load event already passed)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    initializeOnlyFansFeatures();
    checkAndGenerateSignature();
    initializeTimezoneWidget(); // Add timezone widget to all pages
    initializeListSpendBadges();
  });
} else {
  initializeOnlyFansFeatures();
  checkAndGenerateSignature();
  initializeTimezoneWidget(); // Add timezone widget to all pages
  initializeListSpendBadges();
}

// Example: Listen for specific DOM events
document.addEventListener('click', function(event) {
  // Only log clicks on links for demonstration
  if (event.target.tagName === 'A') {
    // Link clicked
  }
});

// Track URL changes for single-page app navigation
let currentUrl = window.location.href;

// Observe DOM changes and check for OnlyFans elements
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if URL changed (for SPA navigation)
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        
        // Reset signature flag when URL changes
        signatureGenerated = false;
        currentChatUserId = null;
        
        // Show loading indicator immediately when page changes
        if (checkOnlyFansChatPage()) {
          showLoadingIndicator();
        }
        
        // Check for chat page and generate signature on URL change
        setTimeout(checkAndGenerateSignature, 200); // Small delay to ensure page is ready
      }
      
      // Check if we need to add our button to newly loaded content
      if (isOnlyFansChatPage()) {
        setTimeout(() => {
          addCustomButtonToChat();
          addQuickEmojiButtonsToForm();
          scanSwipeoutListItemsFromNodes(mutation.addedNodes);
        }, 100); // Small delay to ensure DOM is ready
      }
    }
  });
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Get top countries data from OnlyFans API
async function getTopCountriesData() {
  try {
    const authId = await getAuthIdFromBackground();
    if (!authId) {
      console.log('No auth ID available for top countries request');
      return null;
    }

    // Generate URL with dynamic dates
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0');
    };
    
    const startDate = formatDate(thirtyDaysAgo);
    const endDate = formatDate(now);
    
    // Get current time for endDate time portion (HH:MM:SS)
    const currentTime = now.toTimeString().split(' ')[0]; // Gets HH:MM:SS
    
    const apiUrl = `https://onlyfans.com/api2/v2/users/me/profile/stats?startDate=${startDate}%2000%3A00%3A00&endDate=${endDate}%20${encodeURIComponent(currentTime)}&limit=3&by=total&filter[]=topCountries`;
    
    // Log the generated URL for debugging
    console.log('Generated OnlyFans API URL:', apiUrl);
    
    const data = await makeOnlyFansApiRequest(apiUrl, authId);
    
    if (data && data.topCountries && data.topCountries.rows) {
      console.log('Top countries data received:', data.topCountries.rows);
      return data.topCountries.rows;
    }
    
    console.log('No top countries data in response:', data);
    return null;
  } catch (error) {
    console.error('Error fetching top countries data:', error);
    return null;
  }
}

// Get timezone for country name
function getCountryTimezone(countryName) {
  const countryTimezones = {
    'United States': 'America/New_York',
    'Canada': 'America/Toronto', 
    'United Kingdom': 'Europe/London',
    'Germany': 'Europe/Berlin',
    'France': 'Europe/Paris',
    'Australia': 'Australia/Sydney',
    'Japan': 'Asia/Tokyo',
    'Brazil': 'America/Sao_Paulo',
    'Mexico': 'America/Mexico_City',
    'Italy': 'Europe/Rome',
    'Spain': 'Europe/Madrid',
    'Netherlands': 'Europe/Amsterdam',
    'Sweden': 'Europe/Stockholm',
    'Norway': 'Europe/Oslo',
    'Denmark': 'Europe/Copenhagen',
    'Finland': 'Europe/Helsinki',
    'Switzerland': 'Europe/Zurich',
    'Austria': 'Europe/Vienna',
    'Belgium': 'Europe/Brussels',
    'Poland': 'Europe/Warsaw',
    'Russia': 'Europe/Moscow',
    'India': 'Asia/Kolkata',
    'China': 'Asia/Shanghai',
    'South Korea': 'Asia/Seoul',
    'Singapore': 'Asia/Singapore',
    'Thailand': 'Asia/Bangkok',
    'Philippines': 'Asia/Manila',
    'Indonesia': 'Asia/Jakarta',
    'Malaysia': 'Asia/Kuala_Lumpur',
    'Vietnam': 'Asia/Ho_Chi_Minh',
    'Turkey': 'Europe/Istanbul',
    'Israel': 'Asia/Jerusalem',
    'South Africa': 'Africa/Johannesburg',
    'Egypt': 'Africa/Cairo',
    'Nigeria': 'Africa/Lagos',
    'Kenya': 'Africa/Nairobi',
    'Argentina': 'America/Argentina/Buenos_Aires',
    'Chile': 'America/Santiago',
    'Colombia': 'America/Bogota',
    'Peru': 'America/Lima',
    'Venezuela': 'America/Caracas',
    'Ecuador': 'America/Guayaquil',
    'Uruguay': 'America/Montevideo',
    'Paraguay': 'America/Asuncion',
    'Bolivia': 'America/La_Paz',
    'New Zealand': 'Pacific/Auckland',
    'Ireland': 'Europe/Dublin',
    'Portugal': 'Europe/Lisbon',
    'Greece': 'Europe/Athens',
    'Czech Republic': 'Europe/Prague',
    'Hungary': 'Europe/Budapest',
    'Romania': 'Europe/Bucharest',
    'Bulgaria': 'Europe/Sofia',
    'Croatia': 'Europe/Zagreb',
    'Serbia': 'Europe/Belgrade',
    'Slovakia': 'Europe/Bratislava',
    'Slovenia': 'Europe/Ljubljana',
    'Lithuania': 'Europe/Vilnius',
    'Latvia': 'Europe/Riga',
    'Estonia': 'Europe/Tallinn',
    'Ukraine': 'Europe/Kiev',
    'Belarus': 'Europe/Minsk'
  };
  
  return countryTimezones[countryName] || 'UTC';
}

// Get country flag emoji
function getCountryFlag(countryName) {
  const countryFlags = {
    'United States': '🇺🇸',
    'Canada': '🇨🇦',
    'United Kingdom': '🇬🇧',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'Australia': '🇦🇺',
    'Japan': '🇯🇵',
    'Brazil': '🇧🇷',
    'Mexico': '🇲🇽',
    'Italy': '🇮🇹',
    'Spain': '🇪🇸',
    'Netherlands': '🇳🇱',
    'Sweden': '🇸🇪',
    'Norway': '🇳🇴',
    'Denmark': '🇩🇰',
    'Finland': '🇫🇮',
    'Switzerland': '🇨🇭',
    'Austria': '🇦🇹',
    'Belgium': '🇧🇪',
    'Poland': '🇵🇱',
    'Russia': '🇷🇺',
    'India': '🇮🇳',
    'China': '🇨🇳',
    'South Korea': '🇰🇷',
    'Singapore': '🇸🇬',
    'Thailand': '🇹🇭',
    'Philippines': '🇵🇭',
    'Indonesia': '🇮🇩',
    'Malaysia': '🇲🇾',
    'Vietnam': '🇻🇳',
    'Turkey': '🇹🇷',
    'Israel': '🇮🇱',
    'South Africa': '🇿🇦',
    'Egypt': '🇪🇬',
    'Nigeria': '🇳🇬',
    'Kenya': '🇰🇪',
    'Argentina': '🇦🇷',
    'Chile': '🇨🇱',
    'Colombia': '🇨🇴',
    'Peru': '🇵🇪',
    'Venezuela': '🇻🇪',
    'Ecuador': '🇪🇨',
    'Uruguay': '🇺🇾',
    'Paraguay': '🇵🇾',
    'Bolivia': '🇧🇴',
    'New Zealand': '🇳🇿',
    'Ireland': '🇮🇪',
    'Portugal': '🇵🇹',
    'Greece': '🇬🇷',
    'Czech Republic': '🇨🇿',
    'Hungary': '🇭🇺',
    'Romania': '🇷🇴',
    'Bulgaria': '🇧🇬',
    'Croatia': '🇭🇷',
    'Serbia': '🇷🇸',
    'Slovakia': '🇸🇰',
    'Slovenia': '🇸🇮',
    'Lithuania': '🇱🇹',
    'Latvia': '🇱🇻',
    'Estonia': '🇪🇪',
    'Ukraine': '🇺🇦',
    'Belarus': '🇧🇾'
  };
  
  return countryFlags[countryName] || '🌍';
}

// Dynamic Timezone Widget Functions (Top Countries)
function createDynamicTimezoneWidget() {
  const widget = document.createElement('div');
  widget.id = 'right-info';
  widget.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    margin: 15px 0;
    padding-left: 12px;
    color: #333;
    line-height: 1.4;
  `;

  // Create online button
  const onlineButton = document.createElement('button');
  onlineButton.id = 'online-status-btn';
  onlineButton.style.cssText = `
    background: #28a745;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 12px;
    transition: background-color 0.2s;
    font-family: inherit;
  `;
  
  // Initially show loading state
  onlineButton.textContent = 'Loading...';
  
  onlineButton.addEventListener('mouseenter', () => {
    onlineButton.style.backgroundColor = '#218838';
  });
  
  onlineButton.addEventListener('mouseleave', () => {
    onlineButton.style.backgroundColor = '#28a745';
  });

  widget.appendChild(onlineButton);
  
  // Get real online count and update button
  updateOnlineCount(onlineButton);
  
  // Set up periodic updates every 1 minute (60000ms)
  const updateInterval = setInterval(() => {
    updateOnlineCount(onlineButton);
  }, 60000);
  
  // Store interval ID on the button element for cleanup if needed
  onlineButton.updateInterval = updateInterval;

  // Click to refresh list and open overlay menu
  onlineButton.addEventListener('click', () => {
    // Open menu immediately in loading state
    openOnlineUsersMenu([], onlineButton, { loading: true });
    // Refresh count asynchronously (non-blocking)
    updateOnlineCount(onlineButton);
    // Fetch and then update menu content
    getOnlineSubscribersList()
      .then(users => {
        openOnlineUsersMenu(users, onlineButton);
      })
      .catch(() => {
        // Show empty/error state
        openOnlineUsersMenu([], onlineButton);
      });
  });

  // Create header
  const header = document.createElement('div');
  header.id = 'timezone-header';
  header.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: #666;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  `;
  header.innerHTML = '🌍 TIMEZONES (Loading...)';

  widget.appendChild(header);

  // Create timezone container
  const timezoneContainer = document.createElement('div');
  timezoneContainer.id = 'timezone-container';
  widget.appendChild(timezoneContainer);

  // Load top countries and update timezones
  loadTopCountriesTimezones(widget);

  return widget;
}

// Load top countries and update timezone widget
async function loadTopCountriesTimezones(widget) {
  try {
    const topCountries = await getTopCountriesData();
    const header = widget.querySelector('#timezone-header');
    const container = widget.querySelector('#timezone-container');
    
    if (!topCountries || topCountries.length === 0) {
      // Fallback to USA timezones if API fails
      header.innerHTML = '🇺🇸 TIMEZONES (Fallback)';
      createFallbackUSATimezones(container);
      return;
    }

    // Update header
    header.innerHTML = '🌍 TOP COUNTRIES';
    
    // Clear container
    container.innerHTML = '';
    
    // Create timezone displays for top countries
    topCountries.slice(0, 3).forEach(country => {
      const countryName = country.countryName;
      const timezone = getCountryTimezone(countryName);
      const flag = getCountryFlag(countryName);
      
      const tzDiv = document.createElement('div');
      tzDiv.className = 'timezone-item';
      tzDiv.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 13px;
      `;

      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        color: #555;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      nameDiv.innerHTML = `${flag} ${countryName}`;
      nameDiv.title = countryName; // Tooltip for long names

      const timeDiv = document.createElement('div');
      timeDiv.className = `time-${timezone.replace(/[\/\s_]/g, '-')}`;
      timeDiv.style.cssText = `
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        font-weight: 600;
        color: #333;
        font-size: 12px;
      `;

      tzDiv.appendChild(nameDiv);
      tzDiv.appendChild(timeDiv);
      container.appendChild(tzDiv);
    });
    
    // Update times immediately
    updateDynamicTimezones(topCountries);
    
  } catch (error) {
    // Fallback to USA timezones on error
    const header = widget.querySelector('#timezone-header');
    const container = widget.querySelector('#timezone-container');
    header.innerHTML = '🇺🇸 TIMEZONES (Error)';
    createFallbackUSATimezones(container);
  }
}

// Create fallback USA timezones
function createFallbackUSATimezones(container) {
  container.innerHTML = '';
  
  const timezones = [
    { name: 'Pacific', zone: 'America/Los_Angeles', emoji: '🌴' },
    { name: 'Mountain', zone: 'America/Denver', emoji: '🏔️' },
    { name: 'Central', zone: 'America/Chicago', emoji: '🌾' },
    { name: 'Eastern', zone: 'America/New_York', emoji: '🏙️' }
  ];

  timezones.forEach(tz => {
    const tzDiv = document.createElement('div');
    tzDiv.className = 'timezone-item';
    tzDiv.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 13px;
    `;

    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      color: #555;
    `;
    nameDiv.innerHTML = `${tz.emoji} ${tz.name}`;

    const timeDiv = document.createElement('div');
    timeDiv.className = `time-${tz.zone.replace('/', '-').replace('_', '-')}`;
    timeDiv.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      font-weight: 600;
      color: #333;
      font-size: 12px;
    `;

    tzDiv.appendChild(nameDiv);
    tzDiv.appendChild(timeDiv);
    container.appendChild(tzDiv);
  });
  
  // Update USA timezone times
  updateUSATimezones();
}

// Update dynamic timezones for top countries
function updateDynamicTimezones(topCountries) {
  if (!topCountries || topCountries.length === 0) {
    return;
  }

  topCountries.slice(0, 3).forEach(country => {
    const countryName = country.countryName;
    const timezone = getCountryTimezone(countryName);
    const timeElement = document.querySelector(`.time-${timezone.replace(/[\/\s_]/g, '-')}`);
    
    if (timeElement) {
      try {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
        timeElement.textContent = timeString;
      } catch (error) {
        timeElement.textContent = 'N/A';
      }
    }
  });
}

function updateUSATimezones() {
  const timezones = [
    { zone: 'America/Los_Angeles' },
    { zone: 'America/Denver' },
    { zone: 'America/Chicago' },
    { zone: 'America/New_York' }
  ];

  timezones.forEach(tz => {
    const timeElement = document.querySelector(`.time-${tz.zone.replace('/', '-').replace('_', '-')}`);
    if (timeElement) {
      try {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
          timeZone: tz.zone,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
        timeElement.textContent = timeString;
      } catch (error) {
        timeElement.textContent = 'N/A';
      }
    }
  });
}

function addDynamicTimezoneWidget() {
  // Remove existing widget if any
  const existingWidget = document.getElementById('right-info');
  if (existingWidget) {
    // Clear any existing update intervals to prevent memory leaks
    const existingButton = existingWidget.querySelector('#online-status-btn');
    if (existingButton && existingButton.updateInterval) {
      clearInterval(existingButton.updateInterval);
    }
    // Clear timezone update interval
    if (existingWidget.timezoneUpdateInterval) {
      clearInterval(existingWidget.timezoneUpdateInterval);
    }
    existingWidget.remove();
  }

  // Find the target container
  const targetContainer = document.querySelector('.container.m-main-container');
  if (!targetContainer) {
    return;
  }

  // Create and add the widget
  const widget = createDynamicTimezoneWidget();
  targetContainer.appendChild(widget);

  // Set up periodic updates for dynamic timezones
  let currentTopCountries = null;
  
  const updateTimezones = async () => {
    if (currentTopCountries) {
      updateDynamicTimezones(currentTopCountries);
    } else {
      // Try to get top countries if not loaded yet
      const topCountries = await getTopCountriesData();
      if (topCountries && topCountries.length > 0) {
        currentTopCountries = topCountries;
        updateDynamicTimezones(currentTopCountries);
      } else {
        // Fallback to USA timezones
        updateUSATimezones();
      }
    }
  };

  // Store the interval reference for cleanup and update every second
  widget.timezoneUpdateInterval = setInterval(updateTimezones, 1000);
}

// Initialize timezone widget when page loads
function initializeTimezoneWidget() {
  // Add widget to any page with retry mechanism
  addDynamicTimezoneWidgetWithRetry();
}

// Add timezone widget with retry mechanism
function addDynamicTimezoneWidgetWithRetry(retryCount = 0) {
  const maxRetries = 10;
  
  if (retryCount >= maxRetries) {
    return;
  }
  
  // Try to find the container
  const targetContainer = document.querySelector('.container.m-main-container');
  
  if (!targetContainer) {
    setTimeout(() => addDynamicTimezoneWidgetWithRetry(retryCount + 1), 500);
    return;
  }
  
  // Container found, add the widget
  addDynamicTimezoneWidget();
}

// Cleanup function (called when content script is removed)
window.addEventListener('beforeunload', function() {
  observer.disconnect();
  
  // Clear online count update interval if it exists
  const onlineButton = document.getElementById('online-status-btn');
  if (onlineButton && onlineButton.updateInterval) {
    clearInterval(onlineButton.updateInterval);
  }
  
  // Clear timezone update interval if it exists
  const widget = document.getElementById('right-info');
  if (widget && widget.timezoneUpdateInterval) {
    clearInterval(widget.timezoneUpdateInterval);
  }
});
