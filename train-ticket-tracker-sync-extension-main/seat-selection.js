// Enhanced Auto-select seat content script
// Version 2.2 - Works on search page where seats appear after clicking BOOK NOW
// Runs on: search pages AND dedicated seat pages

(function () {
    'use strict';

    // Prevent double execution
    if (window.__autoSeatInitialized) {
        console.log('[Auto-Seat] Already initialized, skipping');
        return;
    }
    window.__autoSeatInitialized = true;

    // ========================================================================
    // DEBUG PANEL
    // ========================================================================

    const debugLogs = [];
    let logContainer = null;

    function createDebugPanel() {
        const existing = document.querySelector('#auto-seat-debug-panel');
        if (existing) return existing.querySelector('#debug-log-container');

        const panel = document.createElement('div');
        panel.id = 'auto-seat-debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 380px;
            max-height: 250px;
            background: rgba(0, 0, 0, 0.92);
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
        header.textContent = '🎫 Auto-Seat v2.2 (Search Page)';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'debug-log-container';
        panel.appendChild(container);

        document.body.appendChild(panel);
        return container;
    }

    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[Auto-Seat ${time}] ${message}`);
        debugLogs.push({ time, message, type });

        if (!logContainer) logContainer = createDebugPanel();

        const colors = { info: '#0f0', warn: '#ff0', error: '#f44', success: '#0ff' };
        const line = document.createElement('div');
        line.style.cssText = `color: ${colors[type] || colors.info}; margin-bottom: 3px;`;
        line.textContent = `[${time}] ${message}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // ========================================================================
    // NOTIFICATION
    // ========================================================================

    function notify(message, type = 'info') {
        log(`NOTIFY: ${message}`, type);

        const existing = document.querySelector('#auto-seat-notification');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'auto-seat-notification';
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 14px 20px;
            border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        const bg = {
            success: '#27ae60', warning: '#f39c12', info: '#3498db', error: '#e74c3c'
        };
        el.style.background = bg[type] || bg.info;
        el.style.color = type === 'warning' ? '#333' : '#fff';
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 6000);
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ========================================================================
    // WAIT FOR SEAT SELECTION UI TO APPEAR
    // ========================================================================

    function waitForSeatUI() {
        return new Promise(resolve => {
            log('Waiting for seat selection UI...');
            let attempts = 0;
            const maxAttempts = 60; // 30 seconds

            const check = setInterval(() => {
                // Look for "Select Coach" text or coach dropdown
                const pageText = document.body.innerText;
                const hasSelectCoach = pageText.includes('Select Coach');
                const hasSeatPattern = pageText.match(/[A-Z]+\s*-\s*\d+\s*Seat\(s\)/);

                if (hasSelectCoach || hasSeatPattern) {
                    clearInterval(check);
                    log('Seat selection UI detected!', 'success');
                    setTimeout(() => resolve(true), 1500); // Wait for full render
                } else {
                    attempts++;
                    if (attempts % 10 === 0) {
                        log(`Still waiting for seat UI... (${attempts * 0.5}s)`);
                    }
                    if (attempts >= maxAttempts) {
                        clearInterval(check);
                        log('Seat UI not found after 30s', 'warn');
                        resolve(false);
                    }
                }
            }, 500);
        });
    }

    // ========================================================================
    // COACH DROPDOWN
    // ========================================================================

    function findCoachDropdown() {
        log('Looking for coach dropdown...');

        // Strategy 1: Native <select> with Seat(s) options
        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
            const optText = Array.from(sel.options).map(o => o.text).join(' ');
            if (optText.includes('Seat(s)') || optText.match(/[A-Z]+-?\s*\d+\s*Seat/)) {
                log(`Found <select> with ${sel.options.length} options`, 'success');
                return { type: 'select', element: sel };
            }
        }

        // Strategy 2: Look for element showing coach pattern "KHA - 8 Seat(s)"
        const allEls = document.querySelectorAll('*');
        for (const el of allEls) {
            if (el.children.length > 0) continue;
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+\s*-\s*\d+\s*Seat\(s\)$/)) {
                log(`Found coach display: "${text}"`);
                // Find parent that might be dropdown trigger
                let parent = el.parentElement;
                for (let i = 0; i < 6 && parent; i++) {
                    if (parent.tagName === 'SELECT') {
                        return { type: 'select', element: parent };
                    }
                    const role = parent.getAttribute('role');
                    const cls = parent.className || '';
                    if (role === 'button' || role === 'combobox' || role === 'listbox' ||
                        cls.includes('Select') || cls.includes('Dropdown') || cls.includes('MuiInput')) {
                        log(`Found dropdown parent at level ${i}`, 'success');
                        return { type: 'custom', element: parent, label: el };
                    }
                    parent = parent.parentElement;
                }
                // Use the parent anyway
                log('Using direct parent as dropdown trigger');
                return { type: 'custom', element: el.parentElement || el, label: el };
            }
        }

        log('No coach dropdown found!', 'error');
        return null;
    }

    async function getCoachList(dropdown) {
        const coaches = [];

        if (dropdown.type === 'select') {
            const sel = dropdown.element;
            for (let i = 0; i < sel.options.length; i++) {
                const match = sel.options[i].text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
                if (match) {
                    coaches.push({ name: match[1], seats: parseInt(match[2]), index: i, text: sel.options[i].text });
                }
            }
        } else {
            // Open custom dropdown
            log('Opening custom dropdown...');
            dropdown.element.click();
            await delay(800);

            // Find options
            const opts = document.querySelectorAll('li, [role="option"], [class*="Option"], [class*="MenuItem"]');
            log(`Found ${opts.length} potential options`);

            for (const opt of opts) {
                const match = opt.textContent.trim().match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
                if (match) {
                    coaches.push({ name: match[1], seats: parseInt(match[2]), element: opt, text: opt.textContent.trim() });
                }
            }

            // Close dropdown
            document.body.click();
            await delay(300);
        }

        log(`Coaches: ${coaches.map(c => `${c.name}:${c.seats}`).join(', ')}`);
        return coaches;
    }

    async function selectCoach(dropdown, coach) {
        log(`Switching to coach ${coach.name} (${coach.seats} seats)...`);
        notify(`🔄 Switching to ${coach.name}...`, 'info');

        if (dropdown.type === 'select') {
            const sel = dropdown.element;
            sel.selectedIndex = coach.index;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            dropdown.element.click();
            await delay(600);

            // Find and click option
            const opts = document.querySelectorAll('li, [role="option"], [class*="Option"]');
            for (const opt of opts) {
                if (opt.textContent.includes(coach.name)) {
                    opt.click();
                    break;
                }
            }
        }

        await delay(2500); // Wait for seats to load
        log('Coach selected, waiting for seats...');
    }

    // ========================================================================
    // SEAT DETECTION
    // ========================================================================

    function isAvailable(el) {
        const bg = window.getComputedStyle(el).backgroundColor;
        const parentBg = el.parentElement ? window.getComputedStyle(el.parentElement).backgroundColor : '';

        function isGray(rgb) {
            if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return false;
            const m = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (!m) return false;
            const [, r, g, b] = m.map(Number);
            // Gray: similar RGB values, not too dark or light
            return Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r >= 80 && r <= 230;
        }

        return isGray(bg) || isGray(parentBg);
    }

    function findSeats() {
        const seats = [];
        const els = document.querySelectorAll('div, span, button, td');

        for (const el of els) {
            const text = el.textContent.trim();
            // Match: KA-1, KHA-5, GHA-10, etc.
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                seats.push({
                    element: el,
                    text: text,
                    num: parseInt(text.split('-')[1]),
                    available: isAvailable(el)
                });
            }
        }

        const avail = seats.filter(s => s.available).sort((a, b) => a.num - b.num);
        log(`Found ${seats.length} seats, ${avail.length} available`);
        return avail;
    }

    async function clickSeat(seat) {
        log(`Clicking seat: ${seat.text}`, 'success');

        seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(400);

        // Highlight
        seat.element.style.outline = '4px solid #00ff00';
        seat.element.style.boxShadow = '0 0 15px 5px rgba(0,255,0,0.5)';

        seat.element.click();
        await delay(500);

        if (seat.element.parentElement) {
            seat.element.parentElement.click();
        }

        return true;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoSelectSeat() {
        log('=== AUTO SEAT SELECTION STARTED ===', 'success');
        notify('🔍 Looking for seats...', 'info');

        // Wait for seat UI to appear
        const hasUI = await waitForSeatUI();
        if (!hasUI) {
            log('Seat UI never appeared, aborting', 'error');
            notify('⚠️ Seat selection not found', 'warning');
            return;
        }

        await delay(1000); // Extra wait for full render

        // Check if seats are already visible
        let available = findSeats();
        if (available.length > 0) {
            await clickSeat(available[0]);
            notify(`✓ Selected: ${available[0].text}`, 'success');
            log('=== SUCCESS ===', 'success');
            return;
        }

        // Find coach dropdown
        const dropdown = findCoachDropdown();
        if (!dropdown) {
            notify('❌ Cannot find coach selector', 'error');
            return;
        }

        // Get coach list
        const coaches = await getCoachList(dropdown);
        const withSeats = coaches.filter(c => c.seats > 0).sort((a, b) => b.seats - a.seats);

        if (withSeats.length === 0) {
            notify('❌ No seats in any coach!', 'error');
            log('All coaches have 0 seats', 'error');
            return;
        }

        // Try each coach
        for (const coach of withSeats) {
            await selectCoach(dropdown, coach);

            available = findSeats();
            if (available.length > 0) {
                await clickSeat(available[0]);
                notify(`✓ ${available[0].text} in ${coach.name}!`, 'success');
                log('=== SUCCESS ===', 'success');
                return;
            }

            log(`No seats in ${coach.name}, trying next...`, 'warn');
        }

        notify('❌ Could not select seat', 'error');
        log('Failed to find any seat', 'error');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    log('Script loaded, waiting to start...');

    // Start after a delay to let page settle
    setTimeout(() => {
        autoSelectSeat();
    }, 3000);

    // Also watch for dynamic navigation
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            log('URL changed, will re-check for seats...');
            setTimeout(autoSelectSeat, 3000);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
