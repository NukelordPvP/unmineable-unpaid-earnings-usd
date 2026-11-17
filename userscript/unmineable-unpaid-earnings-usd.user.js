
// ==UserScript==
// @name         unMineable - Unpaid Earnings USD
// @namespace    https://unmineable.com/
// @version      2.2
// @description  Shows USD values for all unpaid mining balances, including split payments
// @match        https://unmineable.com/account/*
// @grant        GM_xmlhttpRequest
// @connect      api.coingecko.com
// @connect      api.binance.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const USD_ELEMENT_CLASS = 'unmineable-usd-value';

    const BALANCE_UPDATE_INTERVAL = 2000;
    const PRICE_REFRESH_INTERVAL = 60000;

    const priceCache = {};
    const pendingRequests = {};

    // ============================================================
    // COINGECKO COIN IDS
    // ============================================================

    const COIN_IDS = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        USDT: 'tether',
        USDC: 'usd-coin',
        BNB: 'binancecoin',
        XRP: 'ripple',
        DOGE: 'dogecoin',
        LTC: 'litecoin',
        BCH: 'bitcoin-cash',
        XMR: 'monero',
        RVN: 'ravencoin',
        KAS: 'kaspa',
        CLORE: 'clore-ai',
        ETC: 'ethereum-classic',
        ADA: 'cardano',
        SOL: 'solana',
        TON: 'the-open-network',
        ALPH: 'alephium',
        ERG: 'ergo',
        NEXA: 'nexa',
        DNX: 'dynex',
        CFX: 'conflux-token',
        KLS: 'klever',
        PYI: 'pay-it-now',
        MEWC: 'meowcoin',
        RXD: 'radiant',
        XLM: 'stellar',
        LINK: 'chainlink',
        CRV: 'curve-dao-token',
        FTM: 'fantom',
        MATIC: 'matic-network',
        POL: 'polygon-ecosystem-token'
    };

    // ============================================================
    // GET COIN FROM INDIVIDUAL ASSET CARD
    // ============================================================

    function detectCoin(card) {
        const logo = card.querySelector('.coin-logo');

        if (!logo) return null;

        const alt = logo.getAttribute('alt') || '';
        const src = logo.getAttribute('src') || '';

        let match = alt.match(/^([A-Z0-9]+)\s+logo$/i);

        if (match) {
            return match[1].toUpperCase();
        }

        match = src.match(/\/([A-Z0-9]+)\.png/i);

        if (match) {
            return match[1].toUpperCase();
        }

        return null;
    }

    // ============================================================
    // FETCH COIN PRICE
    // ============================================================

    function fetchCoinPrice(coin) {
        if (!coin) return;

        const cached = priceCache[coin];

        if (
            cached &&
            Date.now() - cached.timestamp < PRICE_REFRESH_INTERVAL
        ) {
            return;
        }

        if (pendingRequests[coin]) return;

        pendingRequests[coin] = true;

        const coinId = COIN_IDS[coin];

        if (!coinId) {
            fetchBinance(coin);
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',

            url:
            'https://api.coingecko.com/api/v3/simple/price' +
            '?ids=' + encodeURIComponent(coinId) +
            '&vs_currencies=usd',

            timeout: 10000,

            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const price = Number(data?.[coinId]?.usd);

                    if (
                        Number.isFinite(price) &&
                        price > 0
                    ) {
                        setPrice(coin, price, 'CoinGecko');
                    } else {
                        fetchBinance(coin);
                    }
                } catch (error) {
                    fetchBinance(coin);
                }
            },

            onerror: function () {
                fetchBinance(coin);
            },

            ontimeout: function () {
                fetchBinance(coin);
            }
        });
    }

    // ============================================================
    // BINANCE BACKUP
    // ============================================================

    function fetchBinance(coin) {
        GM_xmlhttpRequest({
            method: 'GET',

            url:
            'https://api.binance.com/api/v3/ticker/price' +
            '?symbol=' + encodeURIComponent(coin + 'USDT'),

                          timeout: 10000,

                          onload: function (response) {
                              try {
                                  const data = JSON.parse(response.responseText);
                                  const price = Number(data?.price);

                                  if (
                                      Number.isFinite(price) &&
                                      price > 0
                                  ) {
                                      setPrice(coin, price, 'Binance');
                                  } else {
                                      finishRequest(coin);
                                      console.warn(
                                          '[unMineable USD] Price unavailable:',
                                          coin
                                      );
                                  }
                              } catch (error) {
                                  finishRequest(coin);
                                  console.error(error);
                              }
                          },

                          onerror: function () {
                              finishRequest(coin);
                              console.warn(
                                  '[unMineable USD] Binance unavailable:',
                                  coin
                              );
                          },

                          ontimeout: function () {
                              finishRequest(coin);
                          }
        });
    }

    // ============================================================
    // SAVE PRICE
    // ============================================================

    function setPrice(coin, price, source) {
        priceCache[coin] = {
            price: price,
            timestamp: Date.now()
        };

        finishRequest(coin);

        console.log(
            '[unMineable USD]',
            coin + '/USD:',
            price,
            '(' + source + ')'
        );

        updateAllCards();
    }

    function finishRequest(coin) {
        delete pendingRequests[coin];
    }

    // ============================================================
    // GET OR CREATE USD DISPLAY
    // ============================================================

    function getOrCreateUSDElement(balanceElement) {
        const container = balanceElement.parentElement;

        if (!container) return null;

        let usdElement = container.querySelector(
            '.' + USD_ELEMENT_CLASS
        );

        if (!usdElement) {
            usdElement = document.createElement('span');

            usdElement.className = USD_ELEMENT_CLASS;

            usdElement.style.cssText = `
            display: inline-block;
            font-size: 18px;
            font-weight: 500;
            margin-left: 12px;
            color: #4ade80;
            white-space: nowrap;
            vertical-align: middle;
            pointer-events: none;
            `;

            container.appendChild(usdElement);
        }

        return usdElement;
    }

    // ============================================================
    // UPDATE INDIVIDUAL ASSET CARD
    // ============================================================

    function updateCard(card) {
        const balanceElement = card.querySelector(
            '.count-up-balance'
        );

        if (!balanceElement) return;

        const coin = detectCoin(card);

        if (!coin) return;

        const balanceText = balanceElement.textContent.trim();

        const balance = parseFloat(
            balanceText.replace(/,/g, '')
        );

        if (!Number.isFinite(balance)) return;

        const usdElement = getOrCreateUSDElement(
            balanceElement
        );

        if (!usdElement) return;

        const cached = priceCache[coin];

        if (!cached) {
            usdElement.textContent = '≈ $...';
            usdElement.title = 'Waiting for ' + coin + '/USD price';

            fetchCoinPrice(coin);
            return;
        }

        const usdValue = balance * cached.price;

        usdElement.textContent =
        '≈ $' + usdValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        usdElement.title =
        balance + ' ' + coin +
        ' × $' + cached.price.toLocaleString('en-US') +
        ' ' + coin + '/USD';
    }

    // ============================================================
    // UPDATE ALL ASSET CARDS
    // ============================================================

    function updateAllCards() {
        const cards = document.querySelectorAll(
            '.asset-card'
        );

        cards.forEach(function (card) {
            updateCard(card);
        });
    }

    // ============================================================
    // REFRESH ALL PRICES
    // ============================================================

    function refreshPrices() {
        const cards = document.querySelectorAll(
            '.asset-card'
        );

        const coins = new Set();

        cards.forEach(function (card) {
            const coin = detectCoin(card);

            if (coin) {
                coins.add(coin);
            }
        });

        coins.forEach(function (coin) {
            fetchCoinPrice(coin);
        });
    }

    // ============================================================
    // START
    // ============================================================

    function start() {
        console.log(
            '[unMineable USD] Script v2.2 started'
        );

        updateAllCards();
        refreshPrices();

        setInterval(
            updateAllCards,
            BALANCE_UPDATE_INTERVAL
        );

        setInterval(
            refreshPrices,
            PRICE_REFRESH_INTERVAL
        );
    }

    setTimeout(start, 2000);

})();
