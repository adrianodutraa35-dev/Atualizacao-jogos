// ===========================
// GameDeals Hub — Main Application
// ===========================

(function () {
    'use strict';

    // ===========================
    // Configuration
    // ===========================
    const API_BASE = 'https://www.cheapshark.com/api/1.0';
    const DEAL_REDIRECT = 'https://www.cheapshark.com/redirect?dealID=';
    const STORE_IMG_BASE = 'https://www.cheapshark.com';
    const DEALS_PER_PAGE = 12;

    // Currency conversion
    let USD_TO_BRL = 5.65; // fallback rate

    // Key stores we want to highlight (by storeID)
    const FEATURED_STORES = {
        '1': 'Steam',
        '25': 'Epic Games',
        '3': 'GreenManGaming',
        '7': 'GOG',
        '11': 'Humble Bundle',
        '8': 'Origin (EA)',
        '13': 'Uplay',
        '15': 'Fanatical',
        '21': 'WinGameStore',
        '24': 'Xbox Marketplace',
        '27': 'Gamesplanet',
        '29': 'GameBillet',
        '30': 'Voidu',
        '31': 'JoyBuggy',
        '33': 'DLGamer',
        '34': 'Noctre',
        '35': '2Game'
    };

    // ===========================
    // State
    // ===========================
    const state = {
        stores: [],
        deals: [],
        searchResults: [],
        freeGames: [],
        currentPage: 0,
        currentSection: 'deals',
        selectedStore: 'all',
        sortBy: 'Deal Rating',
        maxPrice: 60,
        isLoading: false,
        hasMore: true,
        searchQuery: '',
        exchangeRate: 5.65
    };

    // ===========================
    // DOM Elements
    // ===========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        header: $('#main-header'),
        searchInput: $('#search-input'),
        searchBtn: $('#search-btn'),
        storeFilters: $('#store-filters'),
        sortSelect: $('#sort-select'),
        priceRange: $('#price-range'),
        priceRangeValue: $('#price-range-value'),
        dealsGrid: $('#deals-grid'),
        searchGrid: $('#search-grid'),
        freeGrid: $('#free-grid'),
        loadMoreBtn: $('#load-more-btn'),
        loadMoreWrapper: $('#load-more-wrapper'),
        loadingDeals: $('#loading-deals'),
        loadingSearch: $('#loading-search'),
        loadingFree: $('#loading-free'),
        emptyDeals: $('#empty-deals'),
        emptySearch: $('#empty-search'),
        emptyFree: $('#empty-free'),
        dealsCount: $('#deals-count'),
        searchCount: $('#search-count'),
        freeCount: $('#free-count'),
        searchTitle: $('#search-title'),
        statDeals: $('#stat-deals'),
        statStores: $('#stat-stores'),
        statMaxDiscount: $('#stat-max-discount'),
        footerStoreList: $('#footer-store-list'),
        backToTop: $('#back-to-top')
    };

    // ===========================
    // API Functions
    // ===========================
    async function fetchJSON(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }

    async function fetchExchangeRate() {
        try {
            // Try multiple free exchange rate APIs
            const apis = [
                'https://api.exchangerate-api.com/v4/latest/USD',
                'https://open.er-api.com/v6/latest/USD'
            ];
            for (const apiUrl of apis) {
                try {
                    const res = await fetch(apiUrl);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.rates && data.rates.BRL) {
                            USD_TO_BRL = data.rates.BRL;
                            state.exchangeRate = USD_TO_BRL;
                            console.log(`Câmbio atualizado: 1 USD = R$ ${USD_TO_BRL.toFixed(2)}`);
                            return;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            console.warn('Usando taxa de câmbio padrão:', USD_TO_BRL);
        } catch (error) {
            console.warn('Erro ao buscar câmbio, usando fallback:', USD_TO_BRL);
        }
    }

    function convertToBRL(usdPrice) {
        return parseFloat(usdPrice) * USD_TO_BRL;
    }

    function formatBRL(value) {
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    async function fetchStores() {
        const data = await fetchJSON(`${API_BASE}/stores`);
        if (data) {
            state.stores = data.filter(s => s.isActive === 1);
            renderStoreFilters();
            renderFooterStores();
            animateCounter(els.statStores, state.stores.length);
        }
    }

    async function fetchDeals(page = 0, append = false) {
        if (state.isLoading) return;
        state.isLoading = true;

        if (!append) {
            els.dealsGrid.innerHTML = '';
            els.loadingDeals.classList.remove('hidden');
            els.emptyDeals.classList.add('hidden');
        }
        els.loadMoreBtn.disabled = true;

        let url = `${API_BASE}/deals?pageNumber=${page}&pageSize=${DEALS_PER_PAGE}&onSale=1`;

        if (state.selectedStore !== 'all') {
            url += `&storeID=${state.selectedStore}`;
        }

        if (state.sortBy !== 'recent') {
            url += `&sortBy=${state.sortBy}`;
        }

        if (state.maxPrice < 60) {
            url += `&upperPrice=${state.maxPrice}`;
        }

        const data = await fetchJSON(url);

        els.loadingDeals.classList.add('hidden');
        state.isLoading = false;
        els.loadMoreBtn.disabled = false;

        if (data && data.length > 0) {
            if (append) {
                state.deals = [...state.deals, ...data];
            } else {
                state.deals = data;
            }
            state.hasMore = data.length === DEALS_PER_PAGE;
            renderDeals(data, append);

            if (!append && state.deals.length > 0) {
                const maxSavings = Math.max(...state.deals.map(d => parseFloat(d.savings)));
                animateCounter(els.statMaxDiscount, Math.round(maxSavings), '%');
                animateCounter(els.statDeals, state.deals.length + '+');
            }
        } else {
            if (!append) {
                els.emptyDeals.classList.remove('hidden');
            }
            state.hasMore = false;
        }

        els.loadMoreWrapper.classList.toggle('hidden', !state.hasMore);
    }

    async function searchGames(query) {
        if (!query.trim()) return;

        state.searchQuery = query;
        state.isLoading = true;
        els.searchGrid.innerHTML = '';
        els.loadingSearch.classList.remove('hidden');
        els.emptySearch.classList.add('hidden');

        // First search for deals by title
        const dealsData = await fetchJSON(`${API_BASE}/deals?title=${encodeURIComponent(query)}&onSale=1&pageSize=30`);

        // Also search games list for more comprehensive results
        const gamesData = await fetchJSON(`${API_BASE}/games?title=${encodeURIComponent(query)}&limit=20`);

        els.loadingSearch.classList.add('hidden');
        state.isLoading = false;

        const results = [];

        if (dealsData && dealsData.length > 0) {
            results.push(...dealsData);
        }

        state.searchResults = results;
        els.searchTitle.textContent = `🔍 Resultados para "${query}"`;

        if (results.length > 0) {
            renderSearchResults(results);
            els.searchCount.textContent = `${results.length} resultados`;
        } else {
            els.emptySearch.classList.remove('hidden');
            els.searchCount.textContent = '';
        }
    }

    async function fetchFreeGames() {
        state.isLoading = true;
        els.freeGrid.innerHTML = '';
        els.loadingFree.classList.remove('hidden');
        els.emptyFree.classList.add('hidden');

        const data = await fetchJSON(`${API_BASE}/deals?upperPrice=0&pageSize=30&sortBy=Deal%20Rating`);

        els.loadingFree.classList.add('hidden');
        state.isLoading = false;

        if (data && data.length > 0) {
            state.freeGames = data;
            renderFreeGames(data);
            els.freeCount.textContent = `${data.length} jogos`;
        } else {
            els.emptyFree.classList.remove('hidden');
            els.freeCount.textContent = '';
        }
    }

    // ===========================
    // Render Functions
    // ===========================
    function getStoreName(storeID) {
        const store = state.stores.find(s => s.storeID === storeID);
        return store ? store.storeName : 'Loja';
    }

    function getStoreIcon(storeID) {
        const store = state.stores.find(s => s.storeID === storeID);
        if (store) {
            return `${STORE_IMG_BASE}${store.images.icon}`;
        }
        return '';
    }

    function createDealCard(deal) {
        const savings = Math.round(parseFloat(deal.savings));
        const salePriceUSD = parseFloat(deal.salePrice);
        const normalPriceUSD = parseFloat(deal.normalPrice);
        const salePrice = convertToBRL(salePriceUSD);
        const normalPrice = convertToBRL(normalPriceUSD);
        const storeName = getStoreName(deal.storeID);
        const storeIcon = getStoreIcon(deal.storeID);
        const isFree = salePriceUSD === 0;

        let badgeClass = '';
        let badgeText = '';
        if (isFree) {
            badgeClass = 'free';
            badgeText = 'GRÁTIS';
        } else if (savings >= 75) {
            badgeClass = 'hot';
            badgeText = `-${savings}%`;
        } else if (savings >= 40) {
            badgeClass = 'good';
            badgeText = `-${savings}%`;
        }

        // Metacritic score
        let metacriticHTML = '';
        if (deal.metacriticScore && deal.metacriticScore !== '0') {
            const score = parseInt(deal.metacriticScore);
            const metacriticClass = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
            metacriticHTML = `<span class="deal-metacritic ${metacriticClass}" title="Metacritic">${score}</span>`;
        }

        // Deal rating bar
        const dealRating = deal.dealRating ? parseFloat(deal.dealRating) : 0;
        const ratingWidth = (dealRating / 10) * 100;
        const ratingClass = dealRating >= 7 ? 'high' : dealRating >= 4 ? 'medium' : 'low';

        // Thumbnail
        const thumb = deal.thumb || '';
        const imgSrc = thumb.startsWith('http') ? thumb : (thumb ? `https://www.cheapshark.com${thumb}` : '');

        const card = document.createElement('div');
        card.className = 'deal-card';
        card.innerHTML = `
            <div class="deal-card-image">
                ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHTML(deal.title)}" loading="lazy" onerror="this.style.display='none'">` : ''}
                ${storeIcon ? `
                <div class="deal-store-badge">
                    <img src="${storeIcon}" alt="${escapeHTML(storeName)}">
                    <span>${escapeHTML(storeName)}</span>
                </div>` : ''}
                ${badgeText ? `<span class="deal-badge ${badgeClass}">${badgeText}</span>` : ''}
            </div>
            <div class="deal-card-body">
                <h3 class="deal-title" title="${escapeHTML(deal.title)}">${escapeHTML(deal.title)}</h3>
                <div class="deal-meta">
                    ${dealRating > 0 ? `
                    <div class="deal-rating">
                        <div class="deal-rating-bar">
                            <div class="deal-rating-fill ${ratingClass}" style="width: ${ratingWidth}%"></div>
                        </div>
                        <span>${dealRating.toFixed(1)}</span>
                    </div>` : ''}
                    ${metacriticHTML}
                </div>
                <div class="deal-pricing">
                    <div class="deal-prices">
                        ${normalPrice > salePrice ? `<span class="deal-original-price">${formatBRL(normalPrice)}</span>` : ''}
                        <span class="deal-current-price ${isFree ? 'free' : ''}">
                            ${isFree ? 'GRÁTIS' : formatBRL(salePrice)}
                        </span>
                    </div>
                    <a href="${DEAL_REDIRECT}${deal.dealID}" target="_blank" rel="noopener noreferrer" class="deal-cta">
                        Ver oferta
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                    </a>
                </div>
            </div>
        `;

        return card;
    }

    function renderDeals(deals, append = false) {
        if (!append) {
            els.dealsGrid.innerHTML = '';
        }

        const fragment = document.createDocumentFragment();
        deals.forEach(deal => {
            fragment.appendChild(createDealCard(deal));
        });
        els.dealsGrid.appendChild(fragment);

        els.dealsCount.textContent = `${state.deals.length} ofertas`;
    }

    function renderSearchResults(results) {
        els.searchGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        results.forEach(deal => {
            fragment.appendChild(createDealCard(deal));
        });
        els.searchGrid.appendChild(fragment);
    }

    function renderFreeGames(games) {
        els.freeGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        games.forEach(deal => {
            fragment.appendChild(createDealCard(deal));
        });
        els.freeGrid.appendChild(fragment);
    }

    function renderStoreFilters() {
        // Keep "Todas" button
        const allBtn = els.storeFilters.querySelector('[data-store="all"]');
        els.storeFilters.innerHTML = '';
        els.storeFilters.appendChild(allBtn);

        // Add featured stores
        const featuredIds = Object.keys(FEATURED_STORES);
        state.stores
            .filter(s => featuredIds.includes(s.storeID))
            .sort((a, b) => {
                const order = featuredIds;
                return order.indexOf(a.storeID) - order.indexOf(b.storeID);
            })
            .forEach(store => {
                const chip = document.createElement('button');
                chip.className = 'store-chip';
                chip.dataset.store = store.storeID;
                chip.innerHTML = `
                    <img src="${STORE_IMG_BASE}${store.images.icon}" alt="${escapeHTML(store.storeName)}">
                    ${escapeHTML(store.storeName)}
                `;
                els.storeFilters.appendChild(chip);
            });
    }

    function renderFooterStores() {
        els.footerStoreList.innerHTML = '';
        state.stores
            .filter(s => s.isActive === 1)
            .slice(0, 15)
            .forEach(store => {
                const tag = document.createElement('span');
                tag.className = 'footer-store-tag';
                tag.innerHTML = `
                    <img src="${STORE_IMG_BASE}${store.images.icon}" alt="${escapeHTML(store.storeName)}">
                    ${escapeHTML(store.storeName)}
                `;
                els.footerStoreList.appendChild(tag);
            });
    }

    // ===========================
    // Navigation
    // ===========================
    function switchSection(section) {
        state.currentSection = section;

        // Update nav buttons
        $$('.nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        // Update content sections
        $$('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        $(`#${section}-section`).classList.add('active');

        // Load data if needed
        if (section === 'free' && state.freeGames.length === 0) {
            fetchFreeGames();
        }

        // Show/hide filters for deals section
        const filtersSection = $('#filters-section');
        if (section === 'deals') {
            filtersSection.style.display = '';
        } else {
            filtersSection.style.display = 'none';
        }
    }

    // ===========================
    // Event Handlers
    // ===========================
    function initEventListeners() {
        // Navigation
        $$('.nav-link').forEach(btn => {
            btn.addEventListener('click', () => {
                switchSection(btn.dataset.section);
            });
        });

        // Search
        els.searchBtn.addEventListener('click', handleSearch);
        els.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Store filters
        els.storeFilters.addEventListener('click', (e) => {
            const chip = e.target.closest('.store-chip');
            if (!chip) return;

            $$('.store-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.selectedStore = chip.dataset.store;
            state.currentPage = 0;
            fetchDeals(0);
        });

        // Sort
        els.sortSelect.addEventListener('change', () => {
            state.sortBy = els.sortSelect.value;
            state.currentPage = 0;
            fetchDeals(0);
        });

        // Price range
        els.priceRange.addEventListener('input', () => {
            const val = parseInt(els.priceRange.value);
            state.maxPrice = val;
            els.priceRangeValue.textContent = val >= 60 ? 'Qualquer' : formatBRL(val * USD_TO_BRL);
        });

        els.priceRange.addEventListener('change', () => {
            state.currentPage = 0;
            fetchDeals(0);
        });

        // Load more
        els.loadMoreBtn.addEventListener('click', () => {
            state.currentPage++;
            fetchDeals(state.currentPage, true);
        });

        // Scroll events
        window.addEventListener('scroll', handleScroll, { passive: true });

        // Back to top
        els.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    function handleSearch() {
        const query = els.searchInput.value.trim();
        if (query.length < 2) return;

        switchSection('search');
        searchGames(query);
    }

    function handleScroll() {
        // Header shadow
        els.header.classList.toggle('scrolled', window.scrollY > 10);

        // Back to top button
        els.backToTop.classList.toggle('visible', window.scrollY > 500);
    }

    // ===========================
    // Utilities
    // ===========================
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function animateCounter(element, target, suffix = '') {
        const targetStr = String(target);
        const numericTarget = parseInt(targetStr);

        if (isNaN(numericTarget)) {
            element.textContent = targetStr;
            return;
        }

        let current = 0;
        const duration = 1000;
        const steps = 30;
        const increment = numericTarget / steps;
        const stepTime = duration / steps;

        const timer = setInterval(() => {
            current += increment;
            if (current >= numericTarget) {
                current = numericTarget;
                clearInterval(timer);
            }
            element.textContent = Math.round(current) + suffix;
        }, stepTime);
    }

    // ===========================
    // Initialization
    // ===========================
    async function init() {
        initEventListeners();

        // Fetch exchange rate, stores, then deals
        await fetchExchangeRate();
        await fetchStores();
        await fetchDeals(0);
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
