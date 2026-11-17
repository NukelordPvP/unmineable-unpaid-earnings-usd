
// ==UserScript==
// @name         unMineable - Unpaid Earnings USD
// @namespace    https://unmineable.com/
// @version      2.1
// @description  Displays USD value of unpaid mining earnings with automatic coin detection
// @match        https://unmineable.com/account/*
// @grant        GM_xmlhttpRequest
// @connect      api.coingecko.com
// @connect      api.binance.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const USD_ELEMENT_ID = 'unmineable-usd-value';

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

    const priceCache = {};

    let currentCoin = null;
    let currentPrice = null;
    let priceRequestCoin = null;

    // ============================================================
    // FIND BALANCE
    // ============================================================

    function findBalanceElement() {
        return (
            document.querySelector(
                '.min-height-balance.skeleton-container .bal-contents .count-up-balance'
            ) ||
            document.querySelector(
                '.bal-contents .count-up-balance'
            ) ||
            document.querySelector('.count-up-balance')
        );
    }

    // ============================================================
    // DETECT COIN
    // ============================================================

    function detectCoin() {
        const logo = document.querySelector('.coin-logo');

        if (!logo) return null;

        const alt = logo.getAttribute('alt') || '';
        const src = logo.getAttribute('src') || '';

        let match = alt.match(/^([A-Z0-9]+)\s+logo$/i);

        if (match) return match[1].toUpperCase();

        match = src.match(/\/([A-Z0-9]+)\.png/i);

        if (match) return match[1].toUpperCase();

        return null;
    }

    // ============================================================
    // PRICE CACHE
    // ============================================================

    function setPrice(coin, price, source) {
        priceCache[coin] = {
            price: price,
 timestamp: Date.now()
        };

        if (currentCoin !== coin) return;

        currentPrice = price;
        priceRequestCoin = null;

        console.log(
            '[unMineable USD]',
            coin + '/USD:',
            price,
            '(' + source + ')'
        );

        updateUSD();
    }

    // ============================================================
    // FETCH PRICE
    // ============================================================

    function fetchCoinPrice(coin) {
        if (!coin || priceRequestCoin === coin) return;

        const cached = priceCache[coin];

        if (
            cached &&
            Date.now() - cached.timestamp < 60000
        ) {
            currentPrice = cached.price;
            updateUSD();
            return;
        }

        priceRequestCoin = coin;

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

                    if (Number.isFinite(price) && price > 0) {
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

                                  if (Number.isFinite(price) && price > 0) {
                                      setPrice(coin, price, 'Binance');
                                  } else {
                                      priceRequestCoin = null;
                                      console.error(
                                          '[unMineable USD] Binance price unavailable:',
                                          coin
                                      );
                                  }
                              } catch (error) {
                                  priceRequestCoin = null;
                                  console.error(error);
                              }
                          },

                          onerror: function () {
                              priceRequestCoin = null;
                              console.error(
                                  '[unMineable USD] Binance unavailable:',
                                  coin
                              );
                          },

                          ontimeout: function () {
                              priceRequestCoin = null;
                          }
        });
    }

    // ============================================================
    // USD DISPLAY
    // ============================================================

    function getOrCreateUSDElement(balanceElement) {
        const container =
        balanceElement.closest('.bal-contents') ||
        balanceElement.parentElement;

        if (!container) return null;

        let element = document.getElementById(USD_ELEMENT_ID);

        if (!element || !container.contains(element)) {
            element = document.createElement('span');

            element.id = USD_ELEMENT_ID;

            element.style.cssText = [
                'display:inline-block',
                'font-size:18px',
                'font-weight:500',
                'margin-left:12px',
                'color:#4ade80',
                'white-space:nowrap',
                'vertical-align:middle',
                'pointer-events:none'
            ].join(';');

            container.appendChild(element);
        }

        return element;
    }

    // ============================================================
    // UPDATE DISPLAY
    // ============================================================

    function updateUSD() {
        const balanceElement = findBalanceElement();

        if (!balanceElement) return;

        const balanceText = balanceElement.textContent.trim();

        const balance = parseFloat(
            balanceText.replace(/,/g, '')
        );

        if (!Number.isFinite(balance)) return;

        const usdElement = getOrCreateUSDElement(balanceElement);

        if (!usdElement) return;

        if (!currentCoin || !Number.isFinite(currentPrice)) {
            usdElement.textContent = '≈ $...';
            usdElement.title = 'Waiting for coin price';
            return;
        }

        const usdValue = balance * currentPrice;

        usdElement.textContent =
        '≈ $' + usdValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        usdElement.title =
        balance + ' ' + currentCoin +
        ' × $' + currentPrice.toLocaleString('en-US') +
        ' ' + currentCoin + '/USD';
    }

    // ============================================================
    // SCAN PAGE
    // ============================================================

    function scanPage() {
        const coin = detectCoin();

        if (coin && coin !== currentCoin) {
            console.log('[unMineable USD] Selected coin:', coin);

            currentCoin = coin;
            currentPrice = null;

            updateUSD();
            fetchCoinPrice(coin);

            return;
        }

        updateUSD();
    }

    // ============================================================
    // START
    // ============================================================

    function start() {
        console.log('[unMineable USD] v2.1 started');

        scanPage();

        setInterval(scanPage, 2000);

        setInterval(function () {
            if (currentCoin) {
                fetchCoinPrice(currentCoin);
            }
        }, 60000);
    }

    setTimeout(start, 2000);

})();
