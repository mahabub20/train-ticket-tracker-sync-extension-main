// Auto-grab ticket content script
// Version 3.0 - Uses Chrome storage for target selection
// Runs on: https://eticket.railway.gov.bd/booking/train/search*

(function () {
    'use strict';

    if (window.__autoGrabInitialized) {
        console.log('[Auto-Grab] Already initialized');
        return;
    }
    window.__autoGrabInitialized = true;

    // ========================================================================
    // UNIFIED DRAGGABLE DEBUG PANEL
    // ========================================================================

    let logContainer = null;

    function makeDraggable(panel) {
        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        const header = panel.querySelector('.drag-header');
        if (!header) return;

        header.style.cursor = 'move';

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            panel.style.opacity = '0.9';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            panel.style.left = (e.clientX - offsetX) + 'px';
            panel.style.top = (e.clientY - offsetY) + 'px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.opacity = '1';
        });
    }

    function createDebugPanel() {
        const existing = document.querySelector('#train-ext-debug-panel');
        if (existing) return existing.querySelector('#train-ext-log-container');

        const panel = document.createElement('div');
        panel.id = 'train-ext-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 20px; left: 20px; width: 450px; max-height: 350px;
            background: rgba(10, 10, 30, 0.95); color: #0f0; font-family: monospace; font-size: 11px;
            padding: 0; border-radius: 8px; z-index: 999999; overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6); border: 1px solid #445;
            display: flex; flex-direction: column;
        `;

        const header = document.createElement('div');
        header.className = 'drag-header';
        header.style.cssText = `
            font-weight: bold; padding: 10px 12px; color: #fff; font-size: 12px;
            background: linear-gradient(135deg, #2c3e50, #000);
            border-bottom: 1px solid #445; user-select: none;
            display: flex; justify-content: space-between; align-items: center;
        `;
        header.innerHTML = '<span>🚂 Train Tracker Automation</span><span style="color:#aaa;font-size:10px;">⠿ drag</span>';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'train-ext-log-container';
        container.style.cssText = 'padding: 10px; flex-grow: 1; overflow-y: auto; max-height: 300px;';
        panel.appendChild(container);

        document.body.appendChild(panel);
        makeDraggable(panel);

        return container;
    }

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[Auto-Grab ${time}] ${msg}`);

        if (!logContainer) logContainer = createDebugPanel();

        // Check if log container was removed (e.g. by page nav)
        if (!document.body.contains(logContainer)) {
            logContainer = createDebugPanel();
        }

        const colors = { info: '#aaa', warn: '#ff0', error: '#f44', success: '#0f0', highlight: '#0ff' };
        const line = document.createElement('div');
        line.style.cssText = `color: ${colors[type] || colors.info}; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px;`;

        // Add prefix based on type
        let prefix = '';
        if (type === 'success') prefix = '✓ ';
        if (type === 'error') prefix = '❌ ';
        if (type === 'warn') prefix = '⚠️ ';
        if (type === 'highlight') prefix = '👉 ';

        line.innerHTML = `<span style="color:#666">[${time}]</span> ${prefix}${msg}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    function normalizeClassName(name) {
        if (!name) return '';
        return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    function classNamesMatch(class1, class2) {
        if (!class1 || !class2) return false;
        const c1 = normalizeClassName(class1);
        const c2 = normalizeClassName(class2);
        return c1 === c2 || c1.includes(c2) || c2.includes(c1);
    }

    const delay = ms => new Promise(r => setTimeout(r, ms));

    function notify(msg, type = 'success') {
        log(`NOTIFY: ${msg}`, type === 'success' ? 'success' : type);
        const existing = document.querySelector('#auto-grab-notification');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'auto-grab-notification';
        el.style.cssText = `
            position: fixed; top: 70px; right: 20px; padding: 14px 20px;
            border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px;
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
    // FIND TRAINS
    // ========================================================================

    function waitForTrainCards() {
        return new Promise(resolve => {
            log('Waiting for train cards...');
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
                        log('No buttons found', 'error');
                        resolve(false);
                    }
                }
            }, 500);
        });
    }

    function findTrainSections() {
        const sections = [];
        const allElements = document.querySelectorAll('*');
        const processed = new Set();

        for (const el of allElements) {
            if (el.children.length > 0) continue;

            const text = el.textContent.trim();
            // Match train name pattern: "TRAIN NAME (NUMBER)"
            const match = text.match(/^([A-Z][A-Z\s]+)\s*\((\d+)\)$/);

            if (match) {
                const trainName = match[0];
                const trainNumber = match[2];

                let section = el.parentElement;
                for (let i = 0; i < 12 && section; i++) {
                    const btns = section.querySelectorAll('button');
                    const hasBookNow = Array.from(btns).some(b =>
                        b.textContent.trim().toUpperCase() === 'BOOK NOW'
                    );

                    if (hasBookNow && !processed.has(section)) {
                        processed.add(section);
                        sections.push({
                            element: section,
                            trainName: trainName,
                            trainNumber: trainNumber
                        });
                        break;
                    }
                    section = section.parentElement;
                }
            }
        }

        log(`Found ${sections.length} train sections`);
        sections.forEach(s => log(`  Train: ${s.trainName} (#${s.trainNumber})`));

        return sections;
    }

    function findTicketCardsInSection(section) {
        const cards = [];
        const buttons = section.element.querySelectorAll('button');

        for (const btn of buttons) {
            if (btn.textContent.trim().toUpperCase() !== 'BOOK NOW') continue;

            let card = btn.parentElement;
            let className = '';
            let availCount = 0;

            for (let i = 0; i < 6 && card; i++) {
                const text = card.textContent || '';

                const classPatterns = ['AC_S', 'AC S', 'S_CHAIR', 'S CHAIR', 'SNIGDHA', 'SHOVAN', 'SHOVON', 'F_BERTH', 'F BERTH', 'SLPR'];
                for (const pattern of classPatterns) {
                    if (text.toUpperCase().includes(pattern) && !className) {
                        className = pattern;
                    }
                }

                const availMatch = text.match(/Available\s*Tickets[^0-9]*(\d+)/i);
                if (availMatch) {
                    availCount = parseInt(availMatch[1]);
                }

                if (availCount > 0) break;
                card = card.parentElement;
            }

            cards.push({
                button: btn,
                className: className,
                available: availCount,
                card: card,
                trainNumber: section.trainNumber,
                trainName: section.trainName
            });
        }

        return cards;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoGrabTicket() {
        log('=== TICKET GRABBER v3.0 (Storage) ===', 'success');

        // Read target from Chrome storage
        let targetTrainNumber = '';
        let targetTrainClass = '';

        try {
            const result = await chrome.storage.local.get(['targetTrainNumber', 'targetTrainClass']);
            targetTrainNumber = result.targetTrainNumber || '';
            targetTrainClass = result.targetTrainClass || '';
            log(`From storage: Train#="${targetTrainNumber}" Class="${targetTrainClass}"`);
        } catch (e) {
            log('Could not read from storage: ' + e.message, 'warn');
        }

        // Also check URL params as fallback
        const urlParams = new URLSearchParams(window.location.search);
        const urlClass = urlParams.get('class');
        const urlTrain = urlParams.get('train');
        const urlTrainNumber = urlParams.get('train_number');

        // Extract train number from URL train name if present
        let urlExtractedNumber = '';
        if (urlTrain) {
            const match = urlTrain.match(/\((\d+)\)/);
            if (match) urlExtractedNumber = match[1];
        }

        // Priority: Storage > URL train_number > URL extracted > none
        const effectiveTrainNumber = targetTrainNumber || urlTrainNumber || urlExtractedNumber;
        const effectiveClass = targetTrainClass || urlClass;

        log(`Effective: Train#="${effectiveTrainNumber}" Class="${effectiveClass}"`);

        if (!effectiveTrainNumber && !effectiveClass) {
            log('No target set. Open extension popup to set target!', 'warn');
            notify('⚠️ Set target train in extension popup first!', 'warning');
        }

        const loaded = await waitForTrainCards();
        if (!loaded) {
            notify('Page loading issue', 'error');
            return;
        }

        await delay(800);

        const trainSections = findTrainSections();

        if (trainSections.length === 0) {
            notify('No trains found!', 'error');
            return;
        }

        // Find matching train by train NUMBER
        let targetSection = null;

        if (effectiveTrainNumber) {
            log(`Searching for train #${effectiveTrainNumber}...`);
            targetSection = trainSections.find(s => s.trainNumber === effectiveTrainNumber);
            if (targetSection) {
                log(`✓ FOUND: ${targetSection.trainName}`, 'success');
            } else {
                log(`✗ Train #${effectiveTrainNumber} NOT on this page`, 'warn');
            }
        }

        // Fallback to first train
        if (!targetSection) {
            targetSection = trainSections[0];
            log(`Using first available: ${targetSection.trainName}`, 'warn');
            if (effectiveTrainNumber) {
                notify(`⚠️ Train #${effectiveTrainNumber} not found. Using ${targetSection.trainName}`, 'warning');
            }
        }

        const cards = findTicketCardsInSection(targetSection);
        log(`Found ${cards.length} tickets in ${targetSection.trainName}`);

        if (cards.length === 0) {
            notify('No tickets in this train!', 'error');
            return;
        }

        // Find matching class
        let selectedCard = null;

        if (effectiveClass) {
            log(`Searching for class: ${effectiveClass}...`);
            selectedCard = cards.find(c => classNamesMatch(c.className, effectiveClass));
            if (selectedCard) {
                log(`✓ FOUND class: ${selectedCard.className}`, 'success');
            } else {
                log(`✗ Class ${effectiveClass} not available`, 'warn');
            }
        }

        // Fallback to first available
        if (!selectedCard) {
            selectedCard = cards.find(c => c.available > 0) || cards[0];
            if (effectiveClass) {
                notify(`⚠️ ${effectiveClass} unavailable. Using ${selectedCard.className}`, 'warning');
            }
        }

        // Click the button
        if (selectedCard) {
            notify(`✓ ${targetSection.trainName} - ${selectedCard.className}`, 'success');

            if (selectedCard.card) {
                selectedCard.card.style.boxShadow = '0 0 25px 8px #27ae60';
            }

            await delay(500);
            selectedCard.button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(400);

            log(`Clicking BOOK NOW`, 'success');
            selectedCard.button.click();
        }
    }

    log('Script loaded');

    if (document.readyState === 'complete') {
        setTimeout(autoGrabTicket, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(autoGrabTicket, 1500));
    }

})();
