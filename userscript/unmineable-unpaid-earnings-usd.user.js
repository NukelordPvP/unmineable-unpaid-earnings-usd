
 // ==UserScript==
 // @name         unMineable - Unpaid Earnings USD
 // @namespace    https://unmineable.com/
 // @version      2.6
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
     const PRICE_REFRESH_INTERVAL = 5 * 60 * 1000;
     const COINGECKO_RATE_LIMIT_COOLDOWN = 5 * 60 * 1000;

     const priceCache = {};
     const pendingBinanceRequests = {};
     let coinGeckoRequestPending = false;
     let coinGeckoRetryAfter = 0;

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
         POL: 'polygon-ecosystem-token',
         PRL: 'pearl-2'
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
         if (match) return match[1].toUpperCase();

         match = src.match(/\/([A-Z0-9]+)\.png/i);
         if (match) return match[1].toUpperCase();

         return null;
     }

     // Normalize Pearl's display ticker variants.
     function normalizeCoin(coin) {
         return coin === 'PEARL' ? 'PRL' : coin;
     }

     // ============================================================
     // SAVE PRICE
     // ============================================================

     function setPrice(coin, price, source) {
         if (!Number.isFinite(price) || price <= 0) return;

         priceCache[coin] = {
             price: price,
  timestamp: Date.now()
         };

         console.log(
             '[unMineable USD]',
             coin + '/USD:',
             price,
             '(' + source + ')'
         );

         updateAllCards();
     }

     // ============================================================
     // BINANCE BACKUP
     // ============================================================

     function fetchBinance(coin) {
         // Avoid potentially unrelated PRL ticker on Binance.
         if (coin === 'PRL' || !coin || pendingBinanceRequests[coin]) return;
         pendingBinanceRequests[coin] = true;

         GM_xmlhttpRequest({
             method: 'GET',
             url: 'https://api.binance.com/api/v3/ticker/price?symbol=' +
             encodeURIComponent(coin + 'USDT'),
                           timeout: 10000,
                           onload: function (response) {
                               try {
                                   if (response.status < 200 || response.status >= 300) {
                                       console.warn('[unMineable USD] Binance HTTP error:', coin, response.status);
                                       return;
                                   }

                                   const data = JSON.parse(response.responseText);
                                   const price = Number(data?.price);

                                   if (Number.isFinite(price) && price > 0) {
                                       setPrice(coin, price, 'Binance');
                                   } else {
                                       console.warn('[unMineable USD] Binance price unavailable:', coin);
                                   }
                               } catch (error) {
                                   console.error('[unMineable USD] Binance response error:', coin, error);
                               } finally {
                                   delete pendingBinanceRequests[coin];
                               }
                           },
                           onerror: function () {
                               delete pendingBinanceRequests[coin];
                               console.warn('[unMineable USD] Binance unavailable:', coin);
                           },
                           ontimeout: function () {
                               delete pendingBinanceRequests[coin];
                               console.warn('[unMineable USD] Binance request timed out:', coin);
                           }
         });
     }

     // ============================================================
     // BATCH COINGECKO REQUEST
     // ============================================================

     function fetchCoinGeckoBatch(coins) {
         if (!coins.length || coinGeckoRequestPending) return;
         if (Date.now() < coinGeckoRetryAfter) return;

         const coinToId = {};
         const ids = [];

         coins.forEach(function (coin) {
             const id = COIN_IDS[coin];
             if (id && !ids.includes(id)) {
                 ids.push(id);
                 coinToId[coin] = id;
             }
         });

         if (!ids.length) return;

         coinGeckoRequestPending = true;

         const url =
         'https://api.coingecko.com/api/v3/simple/price' +
         '?ids=' + encodeURIComponent(ids.join(',')) +
         '&vs_currencies=usd';

         console.log('[unMineable USD] CoinGecko batch request:', coins.join(', '));
         console.log('[unMineable USD] API URL:', url);

         GM_xmlhttpRequest({
             method: 'GET',
             url: url,
             timeout: 15000,
             onload: function (response) {
                 try {
                     if (response.status === 429) {
                         coinGeckoRetryAfter = Date.now() + COINGECKO_RATE_LIMIT_COOLDOWN;
                         console.warn('[unMineable USD] CoinGecko rate limited (429). Pausing for 5 minutes.');
                         return;
                     }

                     if (response.status < 200 || response.status >= 300) {
                         console.warn('[unMineable USD] CoinGecko HTTP error:', response.status);
                         return;
                     }

                     const data = JSON.parse(response.responseText);

                     coins.forEach(function (coin) {
                         const id = coinToId[coin];
                         const price = Number(data?.[id]?.usd);

                         if (Number.isFinite(price) && price > 0) {
                             setPrice(coin, price, 'CoinGecko');
                         } else {
                             console.warn('[unMineable USD] CoinGecko returned no price:', coin, 'ID:', id);

                             // Never use Binance fallback for Pearl.
                             if (coin !== 'PRL') {
                                 fetchBinance(coin);
                             }
                         }
                     });
                 } catch (error) {
                     console.error('[unMineable USD] CoinGecko batch response error:', error);
                 } finally {
                     coinGeckoRequestPending = false;
                 }
             },
             onerror: function () {
                 coinGeckoRequestPending = false;
                 console.warn('[unMineable USD] CoinGecko network error; retaining cached prices.');
             },
             ontimeout: function () {
                 coinGeckoRequestPending = false;
                 console.warn('[unMineable USD] CoinGecko request timed out; retaining cached prices.');
             }
         });
     }

     // ============================================================
     // GET OR CREATE USD DISPLAY
     // ============================================================

     function getOrCreateUSDElement(balanceElement) {
         const container = balanceElement.parentElement;
         if (!container) return null;

         let usdElement = container.querySelector('.' + USD_ELEMENT_CLASS);

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
         const balanceElement = card.querySelector('.count-up-balance');
         if (!balanceElement) return;

         const detectedCoin = detectCoin(card);
         if (!detectedCoin) return;

         const coin = normalizeCoin(detectedCoin);

         const balanceText = balanceElement.textContent.trim();
         const balance = parseFloat(balanceText.replace(/,/g, ''));
         if (!Number.isFinite(balance)) return;

         const usdElement = getOrCreateUSDElement(balanceElement);
         if (!usdElement) return;

         const cached = priceCache[coin];

         if (!cached) {
             usdElement.textContent = '≈ $...';
             usdElement.title = 'Waiting for ' + coin + '/USD price';
             return;
         }

         const usdValue = balance * cached.price;

         usdElement.textContent = '≈ $' + usdValue.toLocaleString('en-US', {
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
         document.querySelectorAll('.asset-card').forEach(updateCard);
     }

     // ============================================================
     // REFRESH ALL PRICES
     // ============================================================

     function refreshPrices() {
         const coins = new Set();

         document.querySelectorAll('.asset-card').forEach(function (card) {
             const detectedCoin = detectCoin(card);
             if (!detectedCoin) return;

             coins.add(normalizeCoin(detectedCoin));
         });

         const staleCoinGeckoCoins = [];
         const now = Date.now();

         coins.forEach(function (coin) {
             const cached = priceCache[coin];
             const isStale = !cached || now - cached.timestamp >= PRICE_REFRESH_INTERVAL;
             if (!isStale) return;

             if (COIN_IDS[coin]) {
                 staleCoinGeckoCoins.push(coin);
             } else {
                 fetchBinance(coin);
             }
         });

         fetchCoinGeckoBatch(staleCoinGeckoCoins);
     }

     // ============================================================
     // START
     // ============================================================

     function start() {
         console.log('[unMineable USD] Script v2.6 started (Pearl mapped to pearl-2)');

         updateAllCards();
         refreshPrices();

         setInterval(updateAllCards, BALANCE_UPDATE_INTERVAL);
         setInterval(refreshPrices, PRICE_REFRESH_INTERVAL);
     }

     setTimeout(start, 2000);

 })();
