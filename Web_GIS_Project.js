// Global variables are defined at the top so they can be used
// by more than one function in this js script filelet map.
let markerLayer;
let allData = [];
let currentData = [];
// This constant stores the URL of the raw GitHub file (in my personal github repository)
const RAW_DATA_URL = "https://raw.githubusercontent.com/brooklynlpy/Leeds_Sem2_Web_GIS/main/Carbendazim_Database.js";
// Main function initialized when the page loads, 
// while initialize() is used to set up the Leaflet map
// before any data is added to it
async function initialize() {
  try {
    // Create the Leaflet map object and set the starting view.
    // The coordinates and zoom level define the first map extent shown to the user.
    map = L.map('mapdiv').setView([35.5, 104.0], 4);
    // Add OpenStreetMap as the basemap layer.
    // This gives the user a geographic background under the data points.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    // Create an empty Leaflet layer group to hold all markers.
    // This makes it easier to clear and redraw markers later.
    markerLayer = L.layerGroup().addTo(map);
    // Load the dataset from my GitHub and store it in the global array called allData
    // using the defined founction called loadGitHubRawData (defined later)
    allData = await loadGitHubRawData();
    // Make a copy of all data for the current working dataset.
    // currentData changes when filters are applied
    // this can prevent covering the allData when we make filtering
    currentData = allData.slice();
    // Populate the dropdown menus with selected values taken from the dataset.
    // They make up a new table with media, year and month.
    populateDropdown('mediaSelect', getUniqueValues(allData, 'media'));
    populateDropdown('yearSelect', getUniqueValues(allData, 'year'));
    populateDropdown('monthSelect', getUniqueValues(allData, 'month'));
    // Update the HTML element showing the total number of records.
    document.getElementById('totalCount').textContent = allData.length.toString();
    // Plot all records on the map
    // Notably, if user click the bottom in the webpage, the currentData here will be
    // rewrite with the filtering criteria. The process is operated with filterData founcation
    // defined in this js file 
  } catch (err) {
    // If anything goes wrong during loading, print the error to the console
    // and also show a readable message on the webpage.
    console.error(err);
    setStatus('Failed to load data: ' + err.message);
  }
}

// This function requests the raw data file from GitHub
// and converts it into an array of JavaScript objects.
async function loadGitHubRawData() {
  const response = await fetch(RAW_DATA_URL);
  // Check whether the request worked correctly.
  // If not, stop the script and show the HTTP error code.
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' while reading GitHub raw file.');
  }
  // Read the returned file as plain text.
  const text = await response.text();
  // Extract and parse the data array from the JavaScript file.
  const parsed = parseDatabaseJsToArray(text);
  // Keep only records with valid coordinates.
  // Invalid points are removed here so they are not passed to Leaflet.
  return parsed.filter(function(item) {
    return isValidCoordinate(item.lat, item.lng);
  });
}

// The GitHub file is a JavaScript file rather
// so this function extracts the array section between the first "[" and last "]" of the js file.
// That extracted text is then converted into a JavaScript array using JSON.parse().
function parseDatabaseJsToArray(fileText) {
  const startIndex = fileText.indexOf('[');
  const endIndex = fileText.lastIndexOf(']');
  // If the array cannot be found, stop and return an error.
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Could not extract array from Carbendazim_Database.js');
  }
  // Extract only the array content from the file text.
  const jsonArrayText = fileText.substring(startIndex, endIndex + 1);
  // Convert the text into an actual JavaScript array of objects.
  return JSON.parse(jsonArrayText);
}

// This function adds option values into a dropdown menu in the HTML page.
// It receives an array of unique values and writes them into <option> elements.
function populateDropdown(selectId, values) {
  const select = document.getElementById(selectId);
  for (let i = 0; i < values.length; i++) {
    const option = document.createElement('option');
    option.value = String(values[i]);
    option.textContent = String(values[i]);
    select.appendChild(option);
  }
}

// This function finds all unique values for a chosen field
// such as media, year or month....
// The result is used to build the filter dropdowns.
function getUniqueValues(dataArray, fieldName) {
  const values = dataArray
    .map(function(item) {
      return item[fieldName];
    })
    .filter(function(value) {
      return value !== undefined && value !== null && value !== '';
    });
  // Remove duplicates using Set and sort the values.
  // Numeric values are sorted numerically, while text values are sorted alphabetically.
  return [...new Set(values)].sort(function(a, b) {
    if (!isNaN(a) && !isNaN(b)) {
      return Number(a) - Number(b);
    }
    return String(a).localeCompare(String(b));
  });
}

// This function filters the dataset based on the user selections in the webpage.
// It reads values from the dropdown menus and keyword input box using the DOM (Document Object Model).
function filterData() {
  const mediaValue = document.getElementById('mediaSelect').value.trim().toLowerCase();
  const yearValue = document.getElementById('yearSelect').value.trim();
  const monthValue = document.getElementById('monthSelect').value.trim();
  const keywordValue = document.getElementById('keywordInput').value.trim().toLowerCase();
  // Create a new filtered version of the full dataset.
  currentData = allData.filter(function(item) {
    let match = true;
    // Filter by environmental media.
    if (mediaValue !== '') {
      match = match && String(item.media || '').toLowerCase() === mediaValue;
    }
    // Filter by year.
    if (yearValue !== '') {
      match = match && String(item.year || '') === yearValue;
    }
    // Filter by month.
    if (monthValue !== '') {
      match = match && String(item.month || '') === monthValue;
    }
    // Filter by keyword.
    // The keyword is searched across several text fields joined together as one string.
    if (keywordValue !== '') {
      const searchableText = [
        item.media,
        item.detail,
        item.reference,
        item.sampleSize,
        item.methodology,
        item.backup
      ].join(' ').toLowerCase();
      match = match && searchableText.includes(keywordValue);
    }
    return match;
  });
  // Redraw the map using only the filtered data.
  plotData(currentData);
  // Show a message in the webpage depending on whether any records were found.
  if (currentData.length === 0) {
    setStatus('No records matched the selected filters.');
  } else {
    setStatus('Displayed ' + currentData.length + ' records.');
  }
}

// This function resets the webpage filters back to their default values.
// It then restores the full dataset and redraws all points on the map.
// This function is attached to the reset bottom
function resetFilters() {
  document.getElementById('mediaSelect').value = '';
  document.getElementById('yearSelect').value = '';
  document.getElementById('monthSelect').value = '';
  document.getElementById('keywordInput').value = '';
  // copy the allData
  currentData = allData.slice();
  plotData(currentData);
  setStatus('Filters reset. Showing all records.');
}

// This function zooms the map to the full extent of the selected data.
// It loops through the selected dataset and creates a bounds array for Leaflet.
function zoomToAll() {
  if (!allData || allData.length === 0) {
    setStatus('No valid records available.');
    return;
  }
  const bounds = [];
  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    if (isValidCoordinate(item.lat, item.lng)) {
      bounds.push([parseFloat(item.lat), parseFloat(item.lng)]);
    }
  }
  // Fit the map view to the collected bounds.
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
    setStatus('Zoomed to all records.');
  }
}

// This is the main mapping function.
// It removes old markers, loops through the current dataset,
// creates new Leaflet markers, binds popups, and updates the map extent.
function plotData(dataArray) {
  // Remove any markers already shown on the map.
  clearMarkers();
  // If there is no data to plot, stop and clear the statistics.
  if (!dataArray || dataArray.length === 0) {
    updateStats([]);
    return;
  }
  const bounds = [];
  const locationCount = {};
  // Loop through every record in the current dataset.
  for (let i = 0; i < dataArray.length; i++) {
    const item = dataArray[i];
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    // Skip invalid coordinates.
    if (!isValidCoordinate(lat, lng)) {
      continue;
    }
    // Build a key using latitude and longitude.
    // This is used to detect records that share the same location.
    const key = lat.toFixed(6) + ',' + lng.toFixed(6);
    // Count how many records have already been placed at this coordinate.
    if (!locationCount[key]) {
      locationCount[key] = 0;
    }
    locationCount[key]++;
    const overlapIndex = locationCount[key] - 1;
    // If multiple records share the same coordinate,
    // slightly offset later markers so they do not completely overlap.
    const angle = overlapIndex * 0.9;
    const offsetDistance = 0.03 * overlapIndex;
    const displayLat = lat + Math.sin(angle) * offsetDistance;
    const displayLng = lng + Math.cos(angle) * offsetDistance;
    // Create a circle marker with colour and size based on the data values.
    const marker = L.circleMarker([displayLat, displayLng], {
      radius: getRadius(item.concentration),
      fillColor: getColor(item.media),
      color: '#ffffff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(markerLayer);
    // Attach a popup window to the marker.
    // The popup HTML is created by the buildPopup() function below.
    marker.bindPopup(buildPopup(item), {
      maxWidth: 500,
      minWidth: 320
    });
    // Store marker position for later zoom-to-bounds.
    bounds.push([displayLat, displayLng]);
  }
  // Fit the map to all plotted points.
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
  // Update the summary statistics shown on the webpage.
  updateStats(dataArray);
}

// This function builds the HTML content shown inside each popup window.
// It uses the values from one record and inserts them into formatted HTML.
function buildPopup(item) {
  return `
    <div class="popup-wrap">
      <h3>${escapeHtml(item.detail || 'Carbendazim record')}</h3>
      <p><strong>Media:</strong> ${escapeHtml(item.media || 'N/A')}</p>
      <p><strong>Concentration:</strong> ${formatValue(item.concentration)} ${escapeHtml(item.unit || '')}</p>
      <p><strong>Year:</strong> ${escapeHtml(String(item.year || 'N/A'))}</p>
      <p><strong>Month:</strong> ${escapeHtml(String(item.month || 'N/A'))}</p>
      <p><strong>Coordinates:</strong> ${Number(item.lat).toFixed(4)}, ${Number(item.lng).toFixed(4)}</p>
      <p><strong>Reference:</strong> ${escapeHtml(item.reference || 'N/A')}</p>
      <p><strong>Sample size / scope:</strong> ${escapeHtml(item.sampleSize || 'N/A')}</p>
      <p><strong>Methodology:</strong> ${escapeHtml(item.methodology || 'N/A')}</p>
      <p><strong>Backup information:</strong> ${escapeHtml(item.backup || 'N/A')}</p>
    </div>
  `;
}

// This function clears all markers from the marker layer.
// is an important step for interactive mapping.
function clearMarkers() {
  if (markerLayer) {
  // markerLayer.clearLayers() is from leaflet map
    markerLayer.clearLayers();
  }
}

// This function updates the summary statistics shown on the page.
// It writes the number of displayed records and the maximum concentration value.
function updateStats(dataArray) {
  document.getElementById('displayCount').textContent = dataArray.length.toString();
  // If there are no records, show a dash instead of a number.
  if (!dataArray || dataArray.length === 0) {
    document.getElementById('maxConc').textContent = '-';
    return;
  }
  // Extract concentration values and keep only valid numbers.
  const concentrations = dataArray
    .map(function(item) {
      return parseFloat(item.concentration);
    })
    .filter(function(value) {
      return !isNaN(value);
    });
  // If no valid concentrations exist, again show a dash.
  if (concentrations.length === 0) {
    document.getElementById('maxConc').textContent = '-';
    return;
  }
  // Find and display the highest concentration in the current filtered dataset.
  const maxValue = Math.max.apply(null, concentrations);
  document.getElementById('maxConc').textContent = maxValue.toFixed(2);
}

// This function assigns a marker colour based on the media type.
// Different categories are given different colours to help visual interpretation.
function getColor(media) {
  const m = String(media || '').toLowerCase();
  if (m === 'soil') return '#8b5e3c';//brown
  if (m === 'water') return '#1d4ed8';//blue
  if (m === 'sediment') return '#6b7280';//grey
  if (m === 'crop') return '#16a34a';//green, in case we add crop data
  return '#9333ea';//purple for any data not inculded in soil,water,sediment and crop
}

// This function assigns a marker radius based on concentration.
// Higher concentration values are shown with larger circles.
function getRadius(concentration) {
  const c = parseFloat(concentration);
  if (isNaN(c)) return 6;
  if (c >= 1000) return 14;
  if (c >= 100) return 12;
  if (c >= 10) return 10;
  if (c >= 1) return 8;
  return 6;
}

// This function checks whether latitude and longitude are valid numbers
// and whether they fall inside the normal geographic range.
// in case we type in wrong data, such as adding a zero by mistake
function isValidCoordinate(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  return !isNaN(latNum) && !isNaN(lngNum) &&
         latNum >= -90 && latNum <= 90 &&
         lngNum >= -180 && lngNum <= 180;
}

// This function formats a numeric value, such as concentrations to two decimal places.
// If the value is missing or invalid, it returns N/A instead.
function formatValue(value) {
  const num = parseFloat(value);
  return isNaN(num) ? 'N/A' : num.toFixed(2);
}

// This function writes the current status message into the webpage.
// It updates the HTML element with id="statusBox".
function setStatus(message) {
  document.getElementById('statusBox').textContent = message;
}

// This function escapes special HTML characters in text.
// It helps prevent unwanted HTML code from being interpreted in the popup.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
