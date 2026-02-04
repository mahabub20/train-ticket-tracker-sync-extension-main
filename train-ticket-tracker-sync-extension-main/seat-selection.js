// Enhanced Auto-select seat content script
// Version 2.1 - With Debug Panel for troubleshooting
// Runs on seat selection pages

(function () {
    'use strict';

    // ========================================================================
    // DEBUG PANEL - Shows what's happening on the page
    // ========================================================================

    const debugLogs = [];

    function createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'auto-seat-debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 400px;
            max-height: 300px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 11px;
            padding: 10px;
            border-radius: 8px;
            z-index: 999999;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: #00ffff; font-size: 12px;';
        header.textContent = '🔧 Auto-Seat Debug Panel v2.1';
        panel.appendChild(header);

        const logContainer = document.createElement('div');
        logContainer.id = 'debug-log-container';
        panel.appendChild(logContainer);

        document.body.appendChild(panel);
        return logContainer;
    }

    let logContainer = null;

    function debugLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        debugLogs.push(logEntry);
        console.log(`[Auto-Seat] ${message}`);

        if (!logContainer) {
            logContainer = createDebugPanel();
        }

        const colors = {
            info: '#00ff00',
            warn: '#ffff00',
            error: '#ff4444',
            success: '#00ffff'
        };

        const logLine = document.createElement('div');
        logLine.style.color = colors[type] || colors.info;
        logLine.style.marginBottom = '4px';
        logLine.textContent = logEntry;
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    debugLog('Script loaded!', 'success');
    debugLog(`URL: ${window.location.href}`);

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    const CONFIG = {
        MAX_WAIT_ATTEMPTS: 40,
        POLL_INTERVAL: 500,
        COACH_SWITCH_DELAY: 2500,
        SEAT_CLICK_DELAY: 800
    };

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================================================
    // NOTIFICATION
    // ========================================================================

    function showNotification(message, type = 'info') {
        debugLog(`NOTIFICATION: ${message}`, type === 'error' ? 'error' : 'info');

        const existing = document.querySelector('#auto-seat-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'auto-seat-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 400px;
        `;

        const colors = {
            success: 'linear-gradient(135deg, #27ae60, #2ecc71)',
            warning: 'linear-gradient(135deg, #f39c12, #f1c40f)',
            info: 'linear-gradient(135deg, #3498db, #2980b9)',
            error: 'linear-gradient(135deg, #e74c3c, #c0392b)'
        };

        notification.style.background = colors[type] || colors.info;
        notification.style.color = type === 'warning' ? '#333' : 'white';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 8000);
    }

    // ========================================================================
    // ELEMENT SCANNING
    // ========================================================================

    function scanPageElements() {
        debugLog('Scanning page elements...');

        // Look for text containing "Seat(s)"
        const allText = document.body.innerText;
        const seatMatches = allText.match(/[A-Z]+\s*-\s*\d+\s*Seat\(s\)/g);
        if (seatMatches) {
            debugLog(`Found seat text patterns: ${seatMatches.join(', ')}`);
        } else {
            debugLog('No "X - N Seat(s)" patterns found in page text', 'warn');
        }

        // Look for Select Coach text
        if (allText.includes('Select Coach')) {
            debugLog('Found "Select Coach" text on page');
        }

        // Count all select elements
        const selects = document.querySelectorAll('select');
        debugLog(`Found ${selects.length} <select> elements`);
        selects.forEach((sel, i) => {
            debugLog(`  Select #${i}: ${sel.options.length} options`);
            if (sel.options.length > 0) {
                const optTexts = Array.from(sel.options).slice(0, 3).map(o => o.text);
                debugLog(`    First options: ${optTexts.join(', ')}`);
            }
        });

        // Look for MUI-style elements
        const muiSelects = document.querySelectorAll('[class*="MuiSelect"], [class*="Select"]');
        debugLog(`Found ${muiSelects.length} MUI-style select elements`);

        // Look for clickable elements with Seat(s) text
        const allElements = document.querySelectorAll('*');
        let coachElements = [];
        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+\s*-\s*\d+\s*Seat\(s\)$/) && el.children.length === 0) {
                coachElements.push({ element: el, text });
            }
        }
        debugLog(`Found ${coachElements.length} coach label elements`);
        coachElements.forEach(c => debugLog(`  Coach: "${c.text}"`));

        // Look for seat-like elements
        let seatElements = [];
        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                seatElements.push({ element: el, text, bg: window.getComputedStyle(el).backgroundColor });
            }
        }
        debugLog(`Found ${seatElements.length} seat-like elements`);
        if (seatElements.length > 0) {
            seatElements.slice(0, 5).forEach(s => {
                debugLog(`  Seat: "${s.text}" bg: ${s.bg}`);
            });
        }

        return { coachElements, seatElements, selects };
    }

    // ========================================================================
    // COACH DROPDOWN
    // ========================================================================

    function findCoachDropdown() {
        debugLog('Looking for coach dropdown...');

        // Strategy 1: <select> elements
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
            const options = Array.from(select.options);
            const hasSeatOptions = options.some(o => o.text.includes('Seat(s)'));
            if (hasSeatOptions) {
                debugLog('Found native <select> dropdown with Seat(s) options', 'success');
                return { type: 'select', element: select };
            }
        }

        // Strategy 2: Look for parent of coach label
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+\s*-\s*\d+\s*Seat\(s\)$/) && el.children.length === 0) {
                debugLog(`Found coach label: "${text}"`);

                // Walk up to find clickable parent
                let parent = el.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    const role = parent.getAttribute('role');
                    const classes = parent.className || '';

                    if (role === 'button' || role === 'combobox' ||
                        classes.includes('Select') || classes.includes('Dropdown') ||
                        classes.includes('MuiSelect') || classes.includes('MuiInput')) {
                        debugLog(`Found clickable parent at level ${i}: role=${role}, class=${classes.substring(0, 50)}`, 'success');
                        return { type: 'custom', element: parent, display: el };
                    }
                    parent = parent.parentElement;
                }

                // If no special parent found, try the immediate parent
                debugLog('No special parent found, using direct parent');
                return { type: 'custom', element: el.parentElement || el, display: el };
            }
        }

        debugLog('No coach dropdown found!', 'error');
        return null;
    }

    async function getCoachOptions(dropdownInfo) {
        debugLog('Getting coach options...');

        if (dropdownInfo.type === 'select') {
            const select = dropdownInfo.element;
            const coaches = [];
            for (let i = 0; i < select.options.length; i++) {
                const text = select.options[i].text;
                const match = text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
                if (match) {
                    coaches.push({
                        name: match[1],
                        seats: parseInt(match[2]),
                        index: i,
                        text: text
                    });
                }
            }
            debugLog(`Found ${coaches.length} coaches in select: ${coaches.map(c => `${c.name}:${c.seats}`).join(', ')}`);
            return coaches;
        }

        // Custom dropdown - click to open
        debugLog('Opening custom dropdown...');
        dropdownInfo.element.click();
        await delay(800);

        // Look for options
        const options = document.querySelectorAll('li, [role="option"], [class*="MenuItem"], [class*="Option"]');
        debugLog(`Found ${options.length} potential option elements`);

        const coaches = [];
        for (const opt of options) {
            const text = opt.textContent.trim();
            const match = text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
            if (match) {
                coaches.push({
                    name: match[1],
                    seats: parseInt(match[2]),
                    element: opt,
                    text: text
                });
            }
        }

        debugLog(`Parsed ${coaches.length} coach options: ${coaches.map(c => `${c.name}:${c.seats}`).join(', ')}`);

        // Close dropdown
        document.body.click();
        await delay(300);

        return coaches;
    }

    async function selectCoach(dropdownInfo, coach) {
        debugLog(`Selecting coach: ${coach.name} (${coach.seats} seats)...`);
        showNotification(`🔄 Switching to ${coach.name}...`, 'info');

        if (dropdownInfo.type === 'select') {
            const select = dropdownInfo.element;
            select.value = select.options[coach.index].value;
            select.selectedIndex = coach.index;

            // Dispatch multiple events to trigger React/Angular change handlers
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            debugLog('Dispatched change events on select');
        } else {
            dropdownInfo.element.click();
            await delay(600);

            // Re-find the option (DOM might have changed)
            const options = document.querySelectorAll('li, [role="option"], [class*="MenuItem"]');
            for (const opt of options) {
                if (opt.textContent.includes(coach.name)) {
                    debugLog(`Clicking option for ${coach.name}`);
                    opt.click();
                    break;
                }
            }
        }

        await delay(CONFIG.COACH_SWITCH_DELAY);
        debugLog('Coach switch complete, waiting for seats to load...');
    }

    // ========================================================================
    // SEAT DETECTION
    // ========================================================================

    function isAvailableColor(element) {
        const bg = window.getComputedStyle(element).backgroundColor;
        const parentBg = element.parentElement ? window.getComputedStyle(element.parentElement).backgroundColor : '';

        function isGray(rgb) {
            if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return false;
            const match = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (!match) return false;
            const [, r, g, b] = match.map(Number);
            const isGrayish = Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
            const inRange = r >= 80 && r <= 240;
            return isGrayish && inRange;
        }

        return isGray(bg) || isGray(parentBg);
    }

    function findAvailableSeats() {
        debugLog('Scanning for available seats...');

        const seats = [];
        const allElements = document.querySelectorAll('div, span, button, td');

        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                const available = isAvailableColor(el);
                if (available) {
                    seats.push({
                        element: el,
                        text: text,
                        num: parseInt(text.split('-')[1])
                    });
                }
            }
        }

        seats.sort((a, b) => a.num - b.num);
        debugLog(`Found ${seats.length} available seats: ${seats.slice(0, 5).map(s => s.text).join(', ')}${seats.length > 5 ? '...' : ''}`);
        return seats;
    }

    async function clickSeat(seat) {
        debugLog(`Clicking seat: ${seat.text}`);

        seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(400);

        // Add visual indicator
        seat.element.style.outline = '4px solid #00ff00';
        seat.element.style.boxShadow = '0 0 15px 5px #00ff00';

        // Click the element
        seat.element.click();
        await delay(CONFIG.SEAT_CLICK_DELAY);

        // Try parent click too
        if (seat.element.parentElement) {
            seat.element.parentElement.click();
        }

        debugLog(`Clicked seat ${seat.text}`, 'success');
        return true;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoSelectSeat() {
        debugLog('=== Starting Auto Seat Selection ===', 'success');
        showNotification('🔍 Auto-selecting seat...', 'info');

        await delay(1500); // Initial wait for page

        // First, scan the page
        const scan = scanPageElements();

        // If we already see seats, try to select one
        if (scan.seatElements.length > 0) {
            debugLog('Seats visible on page, checking availability...');
            const available = findAvailableSeats();
            if (available.length > 0) {
                await clickSeat(available[0]);
                showNotification(`✓ Selected: ${available[0].text}`, 'success');
                debugLog('Done!', 'success');
                return;
            }
        }

        // Find and use coach dropdown
        const dropdown = findCoachDropdown();
        if (!dropdown) {
            debugLog('Cannot proceed without coach dropdown', 'error');
            showNotification('❌ Could not find coach selector', 'error');
            return;
        }

        // Get all coaches
        const coaches = await getCoachOptions(dropdown);
        const withSeats = coaches.filter(c => c.seats > 0).sort((a, b) => b.seats - a.seats);

        if (withSeats.length === 0) {
            debugLog('No coaches have available seats!', 'error');
            showNotification('❌ No seats in any coach!', 'error');
            return;
        }

        debugLog(`Coaches with seats: ${withSeats.map(c => `${c.name}:${c.seats}`).join(', ')}`);

        // Try each coach
        for (const coach of withSeats) {
            await selectCoach(dropdown, coach);

            const available = findAvailableSeats();
            if (available.length > 0) {
                await clickSeat(available[0]);
                showNotification(`✓ Selected ${available[0].text} in ${coach.name}!`, 'success');
                debugLog('=== SUCCESS ===', 'success');
                return;
            }

            debugLog(`No available seats found in ${coach.name}, trying next...`, 'warn');
        }

        debugLog('Could not select any seat', 'error');
        showNotification('❌ Could not select seat. Try manually.', 'error');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    debugLog('Setting up initialization...');

    if (document.readyState === 'complete') {
        debugLog('Document ready, starting in 2s...');
        setTimeout(autoSelectSeat, 2000);
    } else {
        debugLog('Waiting for document load...');
        window.addEventListener('load', () => {
            debugLog('Document loaded, starting in 2s...');
            setTimeout(autoSelectSeat, 2000);
        });
    }

})();
