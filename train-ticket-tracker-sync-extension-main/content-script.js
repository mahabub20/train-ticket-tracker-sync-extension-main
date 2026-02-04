// Auto-grab ticket content script
// Version 2.0 - Improved train and class matching
// Runs on: https://eticket.railway.gov.bd/booking/train/search*

(function () {
    'use strict';

    // Prevent double execution
    if (window.__autoGrabInitialized) {
        console.log('[Auto-Grab] Already initialized');
        return;
    }
    window.__autoGrabInitialized = true;

    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const requestedClass = urlParams.get('class');
    const requestedTrain = urlParams.get('train');

    console.log('[Auto-Grab] Looking for train:', requestedTrain, 'class:', requestedClass);

    // ========================================================================
    // DEBUG PANEL
    // ========================================================================

    let logContainer = null;

    function createDebugPanel() {
        const existing = document.querySelector('#auto-grab-debug-panel');
        if (existing) return existing.querySelector('#grab-log-container');

        const panel = document.createElement('div');
        panel.id = 'auto-grab-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 300px; left: 10px; width: 380px; max-height: 200px;
            background: rgba(0,0,50,0.95); color: #0ff; font-family: monospace; font-size: 11px;
            padding: 10px; border-radius: 8px; z-index: 999998; overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: #ff0; font-size: 12px;';
        header.textContent = '🎫 Ticket Grabber v2.0';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'grab-log-container';
        panel.appendChild(container);

        document.body.appendChild(panel);
        return container;
    }

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[Auto-Grab ${time}] ${msg}`);

        if (!logContainer) logContainer = createDebugPanel();

        const colors = { info: '#0ff', warn: '#ff0', error: '#f44', success: '#0f0' };
        const line = document.createElement('div');
        line.style.cssText = `color: ${colors[type] || colors.info}; margin-bottom: 3px;`;
        line.textContent = `[${time}] ${msg}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    function normalizeClassName(name) {
        if (!name) return '';
        // Convert S_CHAIR to S CHAIR, s_chair to S CHAIR, etc.
        return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    function normalizeTrainName(name) {
        if (!name) return '';
        // Make it lowercase for comparison, remove extra spaces
        return name.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function trainNamesMatch(name1, name2) {
        if (!name1 || !name2) return false;
        const n1 = normalizeTrainName(name1);
        const n2 = normalizeTrainName(name2);
        // Check if one contains the other (handles partial matches)
        return n1.includes(n2) || n2.includes(n1) || n1 === n2;
    }

    function classNamesMatch(class1, class2) {
        if (!class1 || !class2) return false;
        const c1 = normalizeClassName(class1);
        const c2 = normalizeClassName(class2);
        return c1 === c2 || c1.includes(c2) || c2.includes(c1);
    }

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ========================================================================
    // NOTIFICATION
    // ========================================================================

    function notify(msg, type = 'success') {
        log(`NOTIFY: ${msg}`, type === 'success' ? 'success' : type);

        const existing = document.querySelector('#auto-grab-notification');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'auto-grab-notification';
        el.style.cssText = `
            position: fixed; top: 70px; right: 20px; padding: 14px 20px;
            border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 380px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        const bg = { success: '#27ae60', warning: '#f39c12', error: '#e74c3c' };
        el.style.background = bg[type] || bg.success;
        el.style.color = type === 'warning' ? '#333' : '#fff';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 8000);
    }

    // ========================================================================
    // FIND TRAIN AND CLASS
    // ========================================================================

    function waitForTrainCards() {
        return new Promise(resolve => {
            log('Waiting for train cards to load...');
            let attempts = 0;

            const check = setInterval(() => {
                const buttons = document.querySelectorAll('button');
                const bookNow = Array.from(buttons).filter(b =>
                    b.textContent.trim().toUpperCase() === 'BOOK NOW'
                );

                if (bookNow.length > 0) {
                    log(`Found ${bookNow.length} BOOK NOW buttons`, 'success');
                    clearInterval(check);
                    setTimeout(() => resolve(true), 1000);
                } else {
                    attempts++;
                    if (attempts >= 40) {
                        clearInterval(check);
                        log('No BOOK NOW buttons found after 20s', 'error');
                        resolve(false);
                    }
                }
            }, 500);
        });
    }

    function findAllTrainCards() {
        const cards = [];

        // Strategy: Find all BOOK NOW buttons and walk up to their containers
        const buttons = document.querySelectorAll('button');

        for (const btn of buttons) {
            if (btn.textContent.trim().toUpperCase() !== 'BOOK NOW') continue;

            // Walk up to find the ticket card (contains class name and price)
            let ticketCard = btn.parentElement;
            for (let i = 0; i < 5; i++) {
                if (!ticketCard) break;
                const text = ticketCard.textContent || '';
                if (text.includes('Available Tickets') || text.includes('Including VAT')) {
                    break;
                }
                ticketCard = ticketCard.parentElement;
            }

            // Now find the train section (contains train name)
            let trainSection = ticketCard;
            let trainName = '';
            for (let i = 0; i < 10; i++) {
                if (!trainSection) break;
                // Look for train name pattern: UPPERCASE WORDS (NUMBER)
                const text = trainSection.textContent || '';
                const match = text.match(/([A-Z\s]+)\s*\((\d+)\)/);
                if (match) {
                    trainName = match[0].trim();
                    break;
                }
                trainSection = trainSection.parentElement;
            }

            // Find class name near the button
            let className = '';
            let searchArea = ticketCard || btn.parentElement;
            if (searchArea) {
                const text = searchArea.textContent || '';
                // Common class patterns
                const classPatterns = ['AC_S', 'AC S', 'S_CHAIR', 'S CHAIR', 'SNIGDHA', 'SHOVAN', 'SHOVON', 'F_BERTH', 'F BERTH', 'F_SEAT', 'F SEAT', 'SLPR'];
                for (const pattern of classPatterns) {
                    if (text.toUpperCase().includes(pattern)) {
                        className = pattern;
                        break;
                    }
                }
            }

            // Get availability count
            let availCount = 0;
            const availMatch = (ticketCard?.textContent || '').match(/(\d+)\s*$/);
            if (availMatch) {
                availCount = parseInt(availMatch[1]);
            }

            cards.push({
                button: btn,
                trainName: trainName,
                className: className,
                available: availCount,
                card: ticketCard
            });
        }

        return cards;
    }

    function findBestMatch(cards, targetTrain, targetClass) {
        log(`Searching ${cards.length} cards for train="${targetTrain}" class="${targetClass}"`);

        // Log all found cards for debugging
        cards.forEach((c, i) => {
            log(`  Card ${i}: train="${c.trainName?.substring(0, 30)}" class="${c.className}" avail=${c.available}`);
        });

        // Priority 1: Exact train + exact class
        for (const card of cards) {
            if (trainNamesMatch(card.trainName, targetTrain) && classNamesMatch(card.className, targetClass)) {
                log(`Found exact match!`, 'success');
                return { card, matchType: 'exact' };
            }
        }

        // Priority 2: Train matches, any class with availability
        for (const card of cards) {
            if (trainNamesMatch(card.trainName, targetTrain) && card.available > 0) {
                log(`Found train match with class=${card.className}`, 'warn');
                return { card, matchType: 'train_only' };
            }
        }

        // Priority 3: Class matches, any train
        for (const card of cards) {
            if (classNamesMatch(card.className, targetClass) && card.available > 0) {
                log(`Found class match on train=${card.trainName}`, 'warn');
                return { card, matchType: 'class_only' };
            }
        }

        // Priority 4: Any card with availability
        for (const card of cards) {
            if (card.available > 0) {
                log(`Fallback to any available ticket`, 'warn');
                return { card, matchType: 'fallback' };
            }
        }

        // Priority 5: First card
        if (cards.length > 0) {
            log(`No match, using first card`, 'warn');
            return { card: cards[0], matchType: 'first' };
        }

        return null;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoGrabTicket() {
        log('=== TICKET GRABBER v2.0 ===', 'success');
        log(`Target: Train="${requestedTrain}" Class="${requestedClass}"`);

        if (!requestedTrain && !requestedClass) {
            log('No train/class specified in URL params', 'warn');
            notify('No target train specified. Select manually.', 'warning');
            return;
        }

        const loaded = await waitForTrainCards();
        if (!loaded) {
            notify('Page loading issue. Please try manually.', 'error');
            return;
        }

        await delay(500);

        const cards = findAllTrainCards();
        log(`Found ${cards.length} ticket cards`);

        if (cards.length === 0) {
            notify('No tickets found on page!', 'error');
            return;
        }

        const match = findBestMatch(cards, requestedTrain, requestedClass);

        if (!match) {
            notify('No matching tickets found!', 'error');
            return;
        }

        const { card, matchType } = match;

        // Show notification based on match type
        if (matchType === 'exact') {
            notify(`✓ Found: ${requestedTrain} - ${requestedClass}`, 'success');
        } else if (matchType === 'train_only') {
            notify(`⚠️ ${requestedClass} not found. Using ${card.className} instead.`, 'warning');
        } else if (matchType === 'class_only') {
            notify(`⚠️ Train not found. Using ${card.trainName?.substring(0, 30)}`, 'warning');
        } else {
            notify(`⚠️ Using first available ticket`, 'warning');
        }

        // Highlight and click
        if (card.card) {
            card.card.style.boxShadow = '0 0 20px 5px #27ae60';
        }

        await delay(500);
        card.button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);

        log(`Clicking BOOK NOW button...`, 'success');
        card.button.click();
    }

    // ========================================================================
    // INIT
    // ========================================================================

    log('Script loaded');

    if (document.readyState === 'complete') {
        setTimeout(autoGrabTicket, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(autoGrabTicket, 1500));
    }

})();
