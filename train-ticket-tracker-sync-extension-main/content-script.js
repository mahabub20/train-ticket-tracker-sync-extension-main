// Auto-grab ticket content script
// Version 2.2 - Draggable debug panel + Train NUMBER matching
// Runs on: https://eticket.railway.gov.bd/booking/train/search*

(function () {
    'use strict';

    if (window.__autoGrabInitialized) {
        console.log('[Auto-Grab] Already initialized');
        return;
    }
    window.__autoGrabInitialized = true;

    const urlParams = new URLSearchParams(window.location.search);
    const requestedClass = urlParams.get('class');
    const requestedTrain = urlParams.get('train');
    const requestedTrainNumber = urlParams.get('train_number');

    console.log('[Auto-Grab] Params:', { train: requestedTrain, trainNumber: requestedTrainNumber, class: requestedClass });

    // ========================================================================
    // DRAGGABLE DEBUG PANEL
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
        const existing = document.querySelector('#auto-grab-debug-panel');
        if (existing) return existing.querySelector('#grab-log-container');

        const panel = document.createElement('div');
        panel.id = 'auto-grab-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 300px; left: 10px; width: 400px; max-height: 240px;
            background: rgba(0,0,50,0.95); color: #0ff; font-family: monospace; font-size: 11px;
            padding: 0; border-radius: 8px; z-index: 999998; overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #334;
        `;

        const header = document.createElement('div');
        header.className = 'drag-header';
        header.style.cssText = `
            font-weight: bold; padding: 8px 10px; color: #ff0; font-size: 12px;
            background: linear-gradient(135deg, #1a1a3e, #162040);
            border-bottom: 1px solid #334; user-select: none;
            display: flex; justify-content: space-between; align-items: center;
        `;
        header.innerHTML = '<span>🎫 Ticket Grabber v2.2</span><span style="color:#666;font-size:10px;">⠿ drag</span>';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'grab-log-container';
        container.style.cssText = 'padding: 10px; max-height: 190px; overflow-y: auto;';
        panel.appendChild(container);

        document.body.appendChild(panel);
        makeDraggable(panel);

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
        return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    function extractTrainNumber(text) {
        if (!text) return '';
        const match = text.match(/\((\d+)\)/);
        if (match) return match[1];
        if (/^\d+$/.test(text.trim())) return text.trim();
        return '';
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
        log('=== TICKET GRABBER v2.2 ===', 'success');
        log(`Target: Train#="${requestedTrainNumber}" Class="${requestedClass}"`);

        if (!requestedTrainNumber && !requestedTrain && !requestedClass) {
            log('No train/class specified', 'warn');
            notify('No target specified', 'warning');
            return;
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

        let targetSection = null;

        if (requestedTrainNumber) {
            targetSection = trainSections.find(s => s.trainNumber === requestedTrainNumber);
            if (targetSection) {
                log(`Found train by number: ${targetSection.trainName}`, 'success');
            }
        }

        if (!targetSection && requestedTrain) {
            const reqNum = extractTrainNumber(requestedTrain);
            if (reqNum) {
                targetSection = trainSections.find(s => s.trainNumber === reqNum);
            }
            if (!targetSection) {
                targetSection = trainSections.find(s =>
                    s.trainName.toLowerCase().includes(requestedTrain.toLowerCase().substring(0, 15))
                );
            }
        }

        if (!targetSection) {
            targetSection = trainSections[0];
            log(`Using first train: ${targetSection.trainName}`, 'warn');
            notify(`⚠️ Train not found. Using ${targetSection.trainName}`, 'warning');
        }

        const cards = findTicketCardsInSection(targetSection);
        log(`Found ${cards.length} tickets in ${targetSection.trainName}`);

        if (cards.length === 0) {
            notify('No tickets in this train!', 'error');
            return;
        }

        let selectedCard = null;

        if (requestedClass) {
            selectedCard = cards.find(c => classNamesMatch(c.className, requestedClass));
            if (selectedCard) {
                log(`Found class: ${selectedCard.className}`, 'success');
            }
        }

        if (!selectedCard) {
            selectedCard = cards.find(c => c.available > 0) || cards[0];
            if (requestedClass) {
                notify(`⚠️ ${requestedClass} unavailable. Using ${selectedCard.className}`, 'warning');
            }
        }

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
