// Popup script for Chrome extension
document.addEventListener('DOMContentLoaded', function() {
  const updateDynamicRulesButton = document.getElementById('updateDynamicRulesButton');
  const statusDiv = document.getElementById('status');
  const apiResponseDiv = document.getElementById('apiResponse');





  // Update Dynamic Rules button click handler
  updateDynamicRulesButton.addEventListener('click', async function() {
    try {
      console.log('🔄 Update Dynamic Rules button clicked');
      showStatus('Fetching dynamic rules...', 'success');
      apiResponseDiv.innerHTML = '';

      // API key - replace with your actual API key
      const apiKey = 'ofauth_zdYkCK5i9yqkXB9PaqopSZ9rK6D5rUJ7o';

      if (!apiKey || apiKey === 'your_api_key_here') {
        showStatus('Please set your API key in the code!', 'error');
        apiResponseDiv.innerHTML = `
          <strong>Error:</strong> API key not set.<br>
          Please replace 'your_api_key_here' with your actual API key in popup.js
        `;
        return;
      }

      console.log('🔑 Using API key:', apiKey.substring(0, 10) + '...');

      // Make API request to get dynamic rules
      const response = await fetch('https://api.ofauth.com/v2/dynamic-rules', {
        method: 'GET',
        headers: {
          'apiKey': apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 API response status:', response.status);
      console.log('📡 API response statusText:', response.statusText);

      if (!response.ok) {
        console.error('❌ API request failed:', response.status);
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        showStatus(`API request failed: ${response.status} ${response.statusText}`, 'error');
        apiResponseDiv.innerHTML = `
          <strong>API Error:</strong><br>
          Status: ${response.status}<br>
          Message: ${response.statusText}<br>
          ${errorText ? `Response: ${errorText}` : ''}
        `;
        return;
      }

      const rulesData = await response.json();
      console.log('✅ Dynamic rules fetched successfully:', rulesData);

      // Save to extension storage
      await chrome.storage.sync.set({
        'dynamicRules': rulesData,
        'lastUpdated': new Date().toISOString()
      });

      console.log('✅ Dynamic rules saved to extension storage');
      showStatus('Dynamic rules updated and saved to extension storage!', 'success');

      // Show preview of the data
      const jsonString = JSON.stringify(rulesData, null, 2);
      apiResponseDiv.innerHTML = `
        <strong>Dynamic Rules Updated:</strong><br>
        <small>Saved to extension storage</small><br>
        <small>Last updated: ${new Date().toLocaleString()}</small><br>
        <details style="margin-top: 10px;">
          <summary>Preview (click to expand)</summary>
          <pre style="font-size: 9px; background: #f8f9fa; padding: 6px; border-radius: 4px; margin: 5px 0; max-height: 150px; overflow-y: auto;">${jsonString}</pre>
        </details>
      `;

    } catch (error) {
      console.error('💥 Error in Update Dynamic Rules:', error);
      showStatus('Error: ' + error.message, 'error');
      apiResponseDiv.innerHTML = `
        <strong>Error:</strong><br>
        ${error.message}<br>
        <details style="margin-top: 10px;">
          <summary>Stack Trace</summary>
          <pre style="font-size: 9px; background: #f5f5f5; padding: 5px; margin-top: 5px;">${error.stack}</pre>
        </details>
      `;
    }
  });

  // Utility function to show status messages
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    // Hide status after 3 seconds
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Load saved data when popup opens
  chrome.storage.sync.get(['extensionData', 'dynamicRules', 'lastUpdated'], function(result) {
    if (result.extensionData) {
      console.log('Loaded extension data:', result.extensionData);
    }
    
    // Show dynamic rules status
    const rulesStatusDiv = document.getElementById('rulesStatus');
    if (result.dynamicRules) {
      const lastUpdated = result.lastUpdated ? new Date(result.lastUpdated).toLocaleString() : 'Unknown';
      rulesStatusDiv.innerHTML = `✅ Rules loaded (Updated: ${lastUpdated})`;
      rulesStatusDiv.style.color = '#155724';
    } else {
      rulesStatusDiv.innerHTML = '❌ No rules found - Click "Update Dynamic Rules" first';
      rulesStatusDiv.style.color = '#721c24';
    }
  });
});
