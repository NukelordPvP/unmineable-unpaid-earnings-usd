
// ==UserScript==
// @name         unMineable - Unpaid Earnings USD
// @namespace    https://unmineable.com/
// @version      2.0
// @description  Shows the USD value of unpaid mining earnings using automatic coin detection
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

    const USD_ELEMENT_ID = 'unmineable-usd-value';

    const BALANCE_UPDATE_INTERVAL = 2000;
    const PRICE_REFRESH_INTERVAL = 60000;
    const PRICE_CACHE_DURATION = 60000;

    let currentCoin = null;
    let currentPrice = null;

    const priceCache = {};

    // ============================================================
    // COIN MAPPING
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
    // FIND BALANCE ELEMENT
    // ============================================================

    function findBalanceElement() {
        return (
            document.querySelector(
                '.min-height-balance.skeleton-container .bal-contents .count-up-balance'
            ) ||
            document.querySelector(
                '.bal-contents .count-up-balance'
            ) ||
            document.querySelector(
                '.count-up-balance'
            )
        );
    }

    // ============================================================
    // DETECT SELECTED COIN
    // ============================================================

    function detectCoin() {
        const logo = document.querySelector(
            '.coin-logo'
        );

        if (!logo) {
            return null;
        }

        // Try image ALT first.
        const alt = logo.getAttribute('alt') || '';

        let match = alt.match(
            /^([A-Z0-9]+)\s+logo$/i
        );

        if (match) {
            return match[1].toUpperCase();
        }

        // Fall back to image filename.
        const src = logo.getAttribute('src') || '';

        match = src.match(
            /\/([A-Z0-9]+)\.png/i
        );

        if (match) {
            return match[1].toUpperCase();
        }

        return null;
    }

    // ============================================================
    // FETCH USD PRICE
    // ============================================================

    function fetchCoinPrice(coin) {
        if (!coin) return;

        const cached = priceCache[coin];

        if (
            cached &&
            Date.now() - cached.timestamp < PRICE_CACHE_DURATION
        ) {
            currentPrice = cached.price;
            updateUSD();
            return;
        }

        const coinId = COIN_IDS[coin];

        if (!coinId) {
            console.warn(
                '[unMineable USD] Unsupported coin:',
                coin
            );

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
                    const data = JSON.parse(
                        response.responseText
                    );

                    const price = Number(
                        data?.[coinId]?.usd
                    );

                    if (
                        Number.isFinite(price) &&
                        price > 0
                    ) {
                        setPrice(
                            coin,
                            price,
                            'CoinGecko'
                        );

                        return;
                    }

                    fetchBinance(coin);

                } catch (error) {
                    console.warn(
                        '[unMineable USD] CoinGecko parsing failed:',
                        error
                    );

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
                                  const data = JSON.parse(
                                      response.responseText
                                  );

                                  const price = Number(data?.price);

                                  if (
                                      Number.isFinite(price) &&
                                      price > 0
                                  ) {
                                      setPrice(
                                          coin,
                                          price,
                                          'Binance'
                                      );

                                      return;
                                  }

                                  console.error(
                                      '[unMineable USD] Invalid Binance price:',
                                      coin
                                  );

                              } catch (error) {
                                  console.error(
                                      '[unMineable USD] Binance parsing failed:',
                                      error
                                  );
                              }
                          },

                          onerror: function () {
                              console.error(
                                  '[unMineable USD] Both price APIs failed:',
                                  coin
                              );
                          },

                          ontimeout: function () {
                              console.error(
                                  '[unMineable USD] Binance timed out:',
                                  coin
                              );
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

        // Prevent an older API response from overwriting
        // the price of a newly selected coin.
        if (currentCoin !== coin) {
            return;
        }

        currentPrice = price;

        console.log(
            '[unMineable USD] ' + coin + '/USD:',
            price,
            '(' + source + ')'
        );

        updateUSD();
    }

    // ============================================================
    // USD DISPLAY ELEMENT
    // ============================================================

    function getOrCreateUSDElement(balanceElement) {
        const container =
        balanceElement.closest('.bal-contents') ||
        balanceElement.parentElement;

        if (!container) return null;

        let usdElement = document.getElementById(
            USD_ELEMENT_ID
        );

        if (
            !usdElement ||
            !container.contains(usdElement)
        ) {
            usdElement = document.createElement('span');

            usdElement.id = USD_ELEMENT_ID;

            usdElement.style.cssText = `
            display: inline-block;
            font-size: 18px;
            font-weight: 500;
            margin-left: 12px;
            color: #4ade80;
            white-space: nowrap;
            vertical-align: middle;
            `;

            container.appendChild(usdElement);
        }

        return usdElement;
    }

    // ============================================================
    // UPDATE USD DISPLAY
    // ============================================================

    function updateUSD() {
        const balanceElement = findBalanceElement();

        if (!balanceElement) return;

        const balanceText =
        balanceElement.textContent.trim();

        const balance = parseFloat(
            balanceText.replace(/,/g, '')
        );

        if (!Number.isFinite(balance)) return;

        const usdElement = getOrCreateUSDElement(
            balanceElement
        );

        if (!usdElement) return;

        if (!currentCoin) {
            usdElement.textContent = '≈ $...';
            usdElement.title = 'Detecting mining coin';
            return;
        }

        if (
            !Number.isFinite(currentPrice) ||
            currentPrice <= 0
        ) {
            usdElement.textContent = '≈ $...';
            usdElement.title =
            'Waiting for ' + currentCoin + '/USD price';
            return;
        }

        const usdValue = balance * currentPrice;

        usdElement.textContent =
        '≈ $' + usdValue.toLocaleString(
            'en-US',
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

        usdElement.title =
        balance + ' ' + currentCoin +
        ' × $' + currentPrice.toLocaleString('en-US') +
        ' ' + currentCoin + '/USD';
    }

    // ============================================================
    // RESCAN PAGE
    // ============================================================

    function rescanPage() {
        const detectedCoin = detectCoin();

        if (!detectedCoin) {
            updateUSD();
            return;
        }

        // Coin changed.
        if (detectedCoin !== currentCoin) {
            console.log(
                '[unMineable USD] Detected coin:',
                detectedCoin
            );

            currentCoin = detectedCoin;
            currentPrice = null;

            updateUSD();
            fetchCoinPrice(detectedCoin);

            return;
        }

        updateUSD();
    }

    // ============================================================
    // START
    // ============================================================

    function start() {
        console.log(
            '[unMineable USD] Script v2.0 started'
        );

        rescanPage();

        // Update balance.
        setInterval(
            updateUSD,
            BALANCE_UPDATE_INTERVAL
        );

        // Detect coin changes.
        setInterval(
            rescanPage,
            2000
        );

        // Refresh price.
        setInterval(
            function () {
                if (currentCoin) {
                    fetchCoinPrice(currentCoin);
                }
            },
            PRICE_REFRESH_INTERVAL
        );

        // Detect Vue DOM replacements.
        const observer = new MutationObserver(
            function () {
                rescanPage();
            }
        );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'alt']
            }
        );
    }

    // ============================================================
    // WAIT FOR UNMINEABLE TO RENDER
    // ============================================================

    setTimeout(start, 2000);

})();
