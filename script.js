/* ================================
   SkyCast Pro - App Script
   Project: Prodesk IT Sprint 03
   Tech: Vanilla JavaScript
================================ */

// OpenWeatherMap API key.
const API_KEY = "33d19be194b91b98b751fdffbcf85191";
const API_BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

// Cache weather responses for 10 minutes.
const CACHE_DURATION = 10 * 60 * 1000;
const HISTORY_LIMIT = 6;
const REQUEST_TIMEOUT = 7000;
const SUGGESTION_LIMIT = 6;

const CITY_RECOMMENDATIONS = [
  "Agra, IN",
  "Ahmedabad, IN",
  "Ajmer, IN",
  "Aligarh, IN",
  "Amritsar, IN",
  "Bengaluru, IN",
  "Bhopal, IN",
  "Bhubaneswar, IN",
  "Chandigarh, IN",
  "Chennai, IN",
  "Coimbatore, IN",
  "Dehradun, IN",
  "Faridabad, IN",
  "Ghaziabad, IN",
  "Gurugram, IN",
  "Guwahati, IN",
  "Hyderabad, IN",
  "Indore, IN",
  "Jaipur, IN",
  "Kanpur, IN",
  "Kochi, IN",
  "Kolkata, IN",
  "Lucknow, IN",
  "Ludhiana, IN",
  "Mumbai, IN",
  "Nagpur, IN",
  "New Delhi, IN",
  "Noida, IN",
  "Patna, IN",
  "Pune, IN",
  "Raipur, IN",
  "Ranchi, IN",
  "Surat, IN",
  "Thiruvananthapuram, IN",
  "Varanasi, IN",
  "Vijayawada, IN",
  "Visakhapatnam, IN",
  "London, GB",
  "New York, US",
  "Los Angeles, US",
  "Chicago, US",
  "Toronto, CA",
  "Dubai, AE",
  "Singapore, SG",
  "Sydney, AU",
  "Tokyo, JP",
  "Paris, FR",
  "Berlin, DE",
];

// DOM references used across the app.
const elements = {
  pageShell: document.querySelector("#page-shell"),
  form: document.querySelector("#weather-form"),
  cityInput: document.querySelector("#city-input"),
  citySuggestions: document.querySelector("#city-suggestions"),
  themeToggle: document.querySelector("#theme-toggle"),
  locationButton: document.querySelector("#location-button"),
  refreshButton: document.querySelector("#refresh-button"),
  downloadButton: document.querySelector("#download-button"),
  celsiusButton: document.querySelector("#celsius-button"),
  fahrenheitButton: document.querySelector("#fahrenheit-button"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  historyList: document.querySelector("#history-list"),
  loadingState: document.querySelector("#loading-state"),
  errorState: document.querySelector("#error-state"),
  errorTitle: document.querySelector("#error-title"),
  errorMessage: document.querySelector("#error-message"),
  weatherCard: document.querySelector("#weather-card"),
  cityName: document.querySelector("#city-name"),
  coordinates: document.querySelector("#coordinates"),
  weatherIcon: document.querySelector("#weather-icon"),
  temperature: document.querySelector("#temperature"),
  condition: document.querySelector("#condition"),
  lastUpdated: document.querySelector("#last-updated"),
  humidity: document.querySelector("#humidity"),
  windSpeed: document.querySelector("#wind-speed"),
  pressure: document.querySelector("#pressure"),
  visibility: document.querySelector("#visibility"),
  sunrise: document.querySelector("#sunrise"),
  sunset: document.querySelector("#sunset"),
};

// Global application state.
const appState = {
  unit: localStorage.getItem("skycast-unit") || "metric",
  currentQuery: localStorage.getItem("skycast-last-query") || "New Delhi",
  currentWeather: null,
};

function getTemperatureLabel() {
  return appState.unit === "metric" ? "C" : "F";
}

function getSpeedLabel() {
  return appState.unit === "metric" ? "m/s" : "mph";
}

function getCacheKey(query) {
  return `skycast-cache-${appState.unit}-${query.toLowerCase()}`;
}

function showLoading(isLoading) {
  elements.loadingState.classList.toggle("hidden", !isLoading);
}

function showError(message, title = "City not found") {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorState.classList.remove("hidden");
}

function hideError() {
  elements.errorState.classList.add("hidden");
}

function formatTime(timestamp, timezoneOffset) {
  const date = new Date((timestamp + timezoneOffset) * 1000);

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDateTime(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toTitleCase(value) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readLocalStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function saveWeatherCache(query, data) {
  const payload = {
    savedAt: Date.now(),
    data,
  };

  localStorage.setItem(getCacheKey(query), JSON.stringify(payload));
}

function readWeatherCache(query) {
  const cached = readLocalStorage(getCacheKey(query), null);

  if (!cached || !cached.savedAt || !cached.data) {
    return null;
  }

  const isFresh = Date.now() - cached.savedAt < CACHE_DURATION;
  return isFresh ? cached.data : null;
}

function getSearchHistory() {
  return readLocalStorage("skycast-history", []);
}

function normalizeCityText(value) {
  return value.trim().toLowerCase();
}

function getCitySuggestions(query) {
  const cleanQuery = normalizeCityText(query);

  if (cleanQuery.length < 2) {
    return [];
  }

  return CITY_RECOMMENDATIONS.map((city) => {
    const cleanCity = normalizeCityText(city);
    const cityName = cleanCity.split(",")[0];

    return {
      city,
      score: cityName.startsWith(cleanQuery) ? 0 : cleanCity.startsWith(cleanQuery) ? 1 : 2,
      isMatch: cityName.includes(cleanQuery) || cleanCity.includes(cleanQuery),
    };
  })
    .filter((item) => item.isMatch)
    .sort((first, second) => first.score - second.score || first.city.localeCompare(second.city))
    .slice(0, SUGGESTION_LIMIT)
    .map((item) => item.city);
}

function hideCitySuggestions() {
  elements.citySuggestions.classList.add("hidden");
  elements.citySuggestions.innerHTML = "";
}

function renderCitySuggestions(query) {
  const suggestions = getCitySuggestions(query);
  elements.citySuggestions.innerHTML = "";

  if (!suggestions.length) {
    hideCitySuggestions();
    return;
  }

  suggestions.forEach((city) => {
    const suggestionButton = document.createElement("button");
    suggestionButton.type = "button";
    suggestionButton.className = "suggestion-item";
    suggestionButton.setAttribute("role", "option");
    suggestionButton.textContent = city;
    suggestionButton.addEventListener("click", () => {
      elements.cityInput.value = city;
      hideCitySuggestions();
      searchWeatherByCity(city);
    });

    elements.citySuggestions.appendChild(suggestionButton);
  });

  elements.citySuggestions.classList.remove("hidden");
}

function saveSearchHistory(city) {
  const cleanCity = city.trim();
  if (!cleanCity) {
    return;
  }

  const history = getSearchHistory().filter(
    (item) => item.toLowerCase() !== cleanCity.toLowerCase()
  );

  history.unshift(cleanCity);
  localStorage.setItem("skycast-history", JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  renderSearchHistory();
}

function renderSearchHistory() {
  const history = getSearchHistory();
  elements.historyList.innerHTML = "";

  if (!history.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "updated";
    emptyMessage.textContent = "No recent searches yet.";
    elements.historyList.appendChild(emptyMessage);
    return;
  }

  history.forEach((city) => {
    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.className = "history-chip";
    historyButton.textContent = city;
    historyButton.addEventListener("click", () => searchWeatherByCity(city));
    elements.historyList.appendChild(historyButton);
  });
}

function updateUnitButtons() {
  elements.celsiusButton.classList.toggle("active", appState.unit === "metric");
  elements.fahrenheitButton.classList.toggle("active", appState.unit === "imperial");
}

function getBackgroundClass(weatherMain) {
  const backgroundMap = {
    Clear: "weather-clear",
    Clouds: "weather-clouds",
    Rain: "weather-rain",
    Drizzle: "weather-drizzle",
    Thunderstorm: "weather-thunderstorm",
    Snow: "weather-snow",
    Mist: "weather-mist",
    Smoke: "weather-haze",
    Haze: "weather-haze",
    Dust: "weather-haze",
    Fog: "weather-fog",
    Sand: "weather-haze",
    Ash: "weather-haze",
    Squall: "weather-rain",
    Tornado: "weather-thunderstorm",
  };

  return backgroundMap[weatherMain] || "weather-clear";
}

function setDynamicBackground(weatherMain) {
  const backgroundClasses = [
    "weather-clear",
    "weather-clouds",
    "weather-rain",
    "weather-drizzle",
    "weather-thunderstorm",
    "weather-snow",
    "weather-mist",
    "weather-fog",
    "weather-haze",
  ];

  elements.pageShell.classList.remove(...backgroundClasses);
  elements.pageShell.classList.add(getBackgroundClass(weatherMain));
}

function renderWeather(data) {
  const weather = data.weather[0];
  const fetchedAt = data.fetchedAt || Date.now();
  const cityDisplay = `${data.name}, ${data.sys.country}`;
  const visibilityKm = (data.visibility / 1000).toFixed(1);

  appState.currentWeather = data;
  appState.currentQuery = data.name;
  localStorage.setItem("skycast-last-query", data.name);

  elements.cityName.textContent = cityDisplay;
  elements.coordinates.textContent = `Lat ${data.coord.lat.toFixed(2)}, Lon ${data.coord.lon.toFixed(2)}`;
  elements.temperature.textContent = `${Math.round(data.main.temp)}\u00b0${getTemperatureLabel()}`;
  elements.condition.textContent = toTitleCase(weather.description);
  elements.lastUpdated.textContent = `Last updated: ${formatDateTime(fetchedAt)}`;
  elements.humidity.textContent = `${data.main.humidity}%`;
  elements.windSpeed.textContent = `${data.wind.speed} ${getSpeedLabel()}`;
  elements.pressure.textContent = `${data.main.pressure} hPa`;
  elements.visibility.textContent = `${visibilityKm} km`;
  elements.sunrise.textContent = formatTime(data.sys.sunrise, data.timezone);
  elements.sunset.textContent = formatTime(data.sys.sunset, data.timezone);
  elements.weatherIcon.src = `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;
  elements.weatherIcon.alt = weather.description;
  elements.weatherIcon.classList.remove("hidden");

  setDynamicBackground(weather.main);
}

async function fetchWeather(params, cacheQuery) {
  const cachedWeather = readWeatherCache(cacheQuery);

  if (cachedWeather) {
    renderWeather(cachedWeather);
    return;
  }

  const query = new URLSearchParams({
    ...params,
    units: appState.unit,
    appid: API_KEY,
  });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const response = await fetch(`${API_BASE_URL}?${query.toString()}`, {
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("City not found");
    }

    if (response.status === 401) {
      throw new Error("Invalid API key");
    }

    throw new Error("Unable to fetch weather data");
  }

  const data = await response.json();
  data.fetchedAt = Date.now();
  saveWeatherCache(cacheQuery, data);
  renderWeather(data);
}

async function searchWeatherByCity(city) {
  const cleanCity = city.trim();

  if (cleanCity.length < 2) {
    showError("Type at least 2 letters to get city recommendations.", "Search too short");
    return;
  }

  showLoading(true);
  hideError();
  hideCitySuggestions();

  try {
    await fetchWeather({ q: cleanCity }, cleanCity);
    saveSearchHistory(cleanCity);
  } catch (error) {
    const isCityError = error.message === "City not found";
    const isTimeout = error.name === "AbortError";
    showError(
      isCityError
        ? "Pick a recommended city or check the spelling and try again."
        : isTimeout
          ? "The search took too long. Try a recommended city."
          : error.message,
      isCityError ? "City not found" : "Weather unavailable"
    );
  } finally {
    showLoading(false);
  }
}

function searchWeatherByLocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported in this browser.", "Location unavailable");
    return;
  }

  showLoading(true);
  hideError();

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const cacheQuery = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;

      try {
        await fetchWeather({ lat: latitude, lon: longitude }, cacheQuery);
        saveSearchHistory(appState.currentWeather.name);
      } catch (error) {
        showError(error.message || "Unable to load weather for your location.", "Weather unavailable");
      } finally {
        showLoading(false);
      }
    },
    () => {
      showLoading(false);
      showError("Location permission was denied.", "Location unavailable");
    }
  );
}

function refreshWeather() {
  if (!appState.currentQuery) {
    return;
  }

  localStorage.removeItem(getCacheKey(appState.currentQuery));
  searchWeatherByCity(appState.currentQuery);
}

function toggleTheme() {
  const isDarkMode = elements.pageShell.classList.toggle("dark");
  elements.themeToggle.textContent = isDarkMode ? "Light" : "Dark";
  localStorage.setItem("skycast-theme", isDarkMode ? "dark" : "light");
}

function downloadWeatherReport() {
  if (!appState.currentWeather) {
    showError("Search a city before downloading the weather report.", "Report unavailable");
    return;
  }

  const originalTitle = document.title;
  document.title = `SkyCast Pro Weather Report - ${appState.currentWeather.name}`;

  // Browser print dialog lets the user save the current weather report as a PDF.
  window.print();
  document.title = originalTitle;
}

function bindEvents() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();

    const city = elements.cityInput.value.trim();
    if (city) {
      searchWeatherByCity(city);
    }
  });

  elements.cityInput.addEventListener("input", () => {
    renderCitySuggestions(elements.cityInput.value);
  });

  elements.cityInput.addEventListener("focus", () => {
    renderCitySuggestions(elements.cityInput.value);
  });

  document.addEventListener("click", (event) => {
    if (!elements.form.contains(event.target)) {
      hideCitySuggestions();
    }
  });

  elements.locationButton.addEventListener("click", searchWeatherByLocation);
  elements.refreshButton.addEventListener("click", refreshWeather);
  elements.downloadButton.addEventListener("click", downloadWeatherReport);
  elements.themeToggle.addEventListener("click", toggleTheme);

  elements.clearHistoryButton.addEventListener("click", () => {
    localStorage.removeItem("skycast-history");
    renderSearchHistory();
  });

  document.querySelectorAll(".unit-button").forEach((button) => {
    button.addEventListener("click", () => {
      appState.unit = button.dataset.unit;
      localStorage.setItem("skycast-unit", appState.unit);
      updateUnitButtons();
      refreshWeather();
    });
  });
}

function applySavedPreferences() {
  const savedTheme = localStorage.getItem("skycast-theme");

  if (savedTheme === "dark") {
    elements.pageShell.classList.add("dark");
    elements.themeToggle.textContent = "Light";
  }

  updateUnitButtons();
}

function initializeApp() {
  bindEvents();
  applySavedPreferences();
  renderSearchHistory();
  searchWeatherByCity(appState.currentQuery);
}

initializeApp();
