// ==UserScript==
// @name         unMineable - Unpaid Earnings USD
// @namespace    https://unmineable.com/
// @version      1.5
// @description  Shows the USD value of unpaid mining earnings on any unMineable account page
// @match        https://unmineable.com/account/*
// @grant        GM_xmlhttpRequest
// @connect      api.coingecko.com
// @connect      api.binance.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    let btcPrice = null;

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const USD_ELEMENT_ID = 'unmineable-usd-value';

    // ============================================================
    // FIND UNPAID BALANCE
    // ============================================================

    function findBalanceElement() {
        // Primary selector from the current unMineable page
        let element = document.querySelector(
            '.min-height-balance.skeleton-container .bal-contents .count-up-balance'
        );

        if (element) {
            return element;
        }

        // Backup selector
        element = document.querySelector(
            '.bal-contents .count-up-balance'
        );

        if (element) {
            return element;
        }

        // Last-resort selector
        element = document.querySelector(
            '.count-up-balance'
        );

        return element || null;
    }

    // ============================================================
    // FETCH BTC/USD FROM COINGECKO
    // ============================================================

    function fetchCoinGecko() {
        GM_xmlhttpRequest({
            method: 'GET',

            url:
            'https://api.coingecko.com/api/v3/simple/price' +
            '?ids=bitcoin&vs_currencies=usd',

            timeout: 10000,

            onload: function (response) {
                try {
                    const data = JSON.parse(
                        response.responseText
                    );

                    const price = Number(
                        data?.bitcoin?.usd
                    );

                    if (
                        Number.isFinite(price) &&
                        price > 0
                    ) {
                        btcPrice = price;

                        console.log(
                            '[unMineable USD] BTC price:',
                            btcPrice,
                            '(CoinGecko)'
                        );

                        updateUSD();

                        return;
                    }

                    console.warn(
                        '[unMineable USD] CoinGecko returned invalid price. Trying Binance...'
                    );

                    fetchBinance();

                } catch (error) {
                    console.warn(
                        '[unMineable USD] CoinGecko parsing failed. Trying Binance...',
                        error
                    );

                    fetchBinance();
                }
            },

            onerror: function () {
                console.warn(
                    '[unMineable USD] CoinGecko unavailable. Trying Binance...'
                );

                fetchBinance();
            },

            ontimeout: function () {
                console.warn(
                    '[unMineable USD] CoinGecko timed out. Trying Binance...'
                );

                fetchBinance();
            }
        });
    }

    // ============================================================
    // BACKUP BTC/USD API
    // ============================================================

    function fetchBinance() {
        GM_xmlhttpRequest({
            method: 'GET',

            url:
            'https://api.binance.com/api/v3/ticker/price' +
            '?symbol=BTCUSDT',

            timeout: 10000,

            onload: function (response) {
                try {
                    const data = JSON.parse(
                        response.responseText
                    );

                    const price = Number(
                        data?.price
                    );

                    if (
                        Number.isFinite(price) &&
                        price > 0
                    ) {
                        btcPrice = price;

                        console.log(
                            '[unMineable USD] BTC price:',
                            btcPrice,
                            '(Binance backup)'
                        );

                        updateUSD();

                        return;
                    }

                    console.error(
                        '[unMineable USD] Binance returned an invalid price'
                    );

                } catch (error) {
                    console.error(
                        '[unMineable USD] Binance parsing error:',
                        error
                    );
                }
            },

            onerror: function () {
                console.error(
                    '[unMineable USD] Both BTC price APIs failed'
                );
            },

            ontimeout: function () {
                console.error(
                    '[unMineable USD] Binance timed out'
                );
            }
        });
    }

    // ============================================================
    // CREATE / GET USD ELEMENT
    // ============================================================

    function getUSDContainer(balanceElement) {
        const balanceContainer =
        balanceElement.closest(
            '.bal-contents'
        );

        if (balanceContainer) {
            return balanceContainer;
        }

        return balanceElement.parentElement;
    }

    function getOrCreateUSDElement(
        balanceElement
    ) {
        let usdElement =
        document.getElementById(
            USD_ELEMENT_ID
        );

        const container =
        getUSDContainer(
            balanceElement
        );

        if (!container) {
            return null;
        }

        // If Vue replaced the old element,
        // make a new one.
        if (
            !usdElement ||
            !container.contains(usdElement)
        ) {
            usdElement =
            document.createElement(
                'span'
            );

            usdElement.id =
            USD_ELEMENT_ID;

            usdElement.style.cssText = `
            display: inline-block;
            font-size: 18px;
            font-weight: 500;
            margin-left: 12px;
            color: #4ade80;
            white-space: nowrap;
            vertical-align: middle;
            `;

            container.appendChild(
                usdElement
            );
        }

        return usdElement;
    }

    // ============================================================
    // UPDATE USD DISPLAY
    // ============================================================

    function updateUSD() {
        const balanceElement =
        findBalanceElement();

        if (!balanceElement) {
            return;
        }

        const balanceText =
        balanceElement.textContent.trim();

        const balance =
        parseFloat(
            balanceText
        );

        if (!Number.isFinite(balance)) {
            console.warn(
                '[unMineable USD] Invalid balance:',
                balanceText
            );

            return;
        }

        const usdElement =
        getOrCreateUSDElement(
            balanceElement
        );

        if (!usdElement) {
            return;
        }

        // --------------------------------------------------------
        // BTC price hasn't loaded yet
        // --------------------------------------------------------

        if (
            !Number.isFinite(
                btcPrice
            )
        ) {
            usdElement.textContent =
            '≈ $...';

            usdElement.title =
            'Waiting for BTC/USD price';

            return;
        }

        // --------------------------------------------------------
        // Calculate USD
        // --------------------------------------------------------

        const usdValue =
        balance * btcPrice;

        usdElement.textContent =
        `≈ $${usdValue.toLocaleString(
            'en-US',
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )}`;

        usdElement.title =
        `${balance} BTC × $${btcPrice.toLocaleString(
            'en-US'
        )} BTC/USD`;
    }

    // ============================================================
    // RESCAN PAGE
    // ============================================================

    function rescanPage() {
        updateUSD();
    }

    // ============================================================
    // START
    // ============================================================

    function start() {
        console.log(
            '[unMineable USD] Script started'
        );

        // Initial BTC price
        fetchCoinGecko();

        // Update unpaid balance every 2 seconds
        setInterval(
            updateUSD,
            2000
        );

        // Rescan the page every 30 seconds
        // This handles Vue replacing DOM elements.
        setInterval(
            rescanPage,
            30000
        );

        // Refresh BTC/USD price every 60 seconds
        // CoinGecko -> Binance fallback.
        setInterval(
            fetchCoinGecko,
            60000
        );
    }

    // ============================================================
    // WAIT FOR UNMINEABLE TO RENDER
    // ============================================================

    setTimeout(
        start,
        2000
    );

})();
