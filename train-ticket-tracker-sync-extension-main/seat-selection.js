// Enhanced Auto-select seat content script
// Version 2.3 - Fixed color detection for available seats
// Available = light gray/white, Booked = orange, Selected = teal/green

(function () {
    'use strict';

    if (window.__autoSeatInitialized) {
        console.log('[Auto-Seat] Already initialized');
        return;
    }
    window.__autoSeatInitialized = true;

    // ========================================================================
    // DEBUG PANEL
    // ========================================================================

    let logContainer = null;

    function createDebugPanel() {
        const existing = document.querySelector('#auto-seat-debug-panel');
        if (existing) return existing.querySelector('#debug-log-container');

        const panel = document.createElement('div');
        panel.id = 'auto-seat-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 10px; left: 10px; width: 400px; max-height: 280px;
            background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace; font-size: 11px;
            padding: 10px; border-radius: 8px; z-index: 999999; overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: #0ff; font-size: 12px;';
        header.textContent = '🎫 Auto-Seat v2.3 (Color Fix)';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'debug-log-container';
        panel.appendChild(container);

        document.body.appendChild(panel);
        return container;
    }

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[Auto-Seat ${time}] ${msg}`);

        if (!logContainer) logContainer = createDebugPanel();

        const colors = { info: '#0f0', warn: '#ff0', error: '#f44', success: '#0ff' };
        const line = document.createElement('div');
        line.style.cssText = `color: ${colors[type] || colors.info}; margin-bottom: 3px;`;
        line.textContent = `[${time}] ${msg}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function notify(msg, type = 'info') {
        log(`NOTIFY: ${msg}`, type);
        const existing = document.querySelector('#auto-seat-notification');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'auto-seat-notification';
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 14px 20px;
            border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        const bg = { success: '#27ae60', warning: '#f39c12', info: '#3498db', error: '#e74c3c' };
        el.style.background = bg[type] || bg.info;
        el.style.color = type === 'warning' ? '#333' : '#fff';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 6000);
    }

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // ========================================================================
    // WAIT FOR SEAT UI
    // ========================================================================

    function waitForSeatUI() {
        return new Promise(resolve => {
            log('Waiting for seat UI...');
            let attempts = 0;

            const check = setInterval(() => {
                const hasCoach = document.body.innerText.includes('Select Coach');
                const hasSeat = document.body.innerText.match(/[A-Z]+\s*-\s*\d+\s*Seat/);

                if (hasCoach || hasSeat) {
                    clearInterval(check);
                    log('Seat UI detected!', 'success');
                    setTimeout(() => resolve(true), 1500);
                } else {
                    attempts++;
                    if (attempts >= 60) {
                        clearInterval(check);
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

        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
            const optText = Array.from(sel.options).map(o => o.text).join(' ');
            if (optText.includes('Seat(s)') || optText.match(/[A-Z]+-?\s*\d+\s*Seat/)) {
                log(`Found <select> with ${sel.options.length} options`, 'success');
                return { type: 'select', element: sel };
            }
        }

        log('No select dropdown found, looking for custom...', 'warn');
        return null;
    }

    async function getCoaches(dropdown) {
        const coaches = [];
        const sel = dropdown.element;

        for (let i = 0; i < sel.options.length; i++) {
            const text = sel.options[i].text;
            const match = text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
            if (match) {
                coaches.push({
                    name: match[1],
                    seats: parseInt(match[2]),
                    index: i,
                    value: sel.options[i].value
                });
            }
        }

        log(`Coaches: ${coaches.map(c => `${c.name}:${c.seats}`).join(', ')}`);
        return coaches;
    }

    async function selectCoach(dropdown, coach) {
        log(`Switching to ${coach.name} (${coach.seats} seats)...`);
        notify(`🔄 Switching to ${coach.name}...`, 'info');

        const sel = dropdown.element;
        sel.value = coach.value;
        sel.selectedIndex = coach.index;

        // Trigger all possible change events
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        sel.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await delay(3000); // Wait for seats to load
        log('Coach selected, scanning seats...');
    }

    // ========================================================================
    // SEAT DETECTION - FIXED COLOR LOGIC
    // ========================================================================

    function parseRGB(rgb) {
        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
        const m = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return null;
        return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    }

    function classifySeatColor(bgColor) {
        const c = parseRGB(bgColor);
        if (!c) return 'unknown';

        const { r, g, b } = c;

        // Orange/Red = BOOKED (r > 200, g < 150, b < 100)
        if (r > 180 && g > 100 && g < 180 && b < 100) {
            return 'booked'; // Orange
        }

        // Green/Teal = SELECTED or IN PROGRESS (g > r, g > b)
        if (g > r && g > b && g > 150) {
            return 'selected';
        }

        // Gray/Light = AVAILABLE (r ≈ g ≈ b, and not too dark)
        const isGrayish = Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && Math.abs(r - b) < 40;
        if (isGrayish && r >= 100 && r <= 240) {
            return 'available';
        }

        // White or very light = AVAILABLE
        if (r > 200 && g > 200 && b > 200) {
            return 'available';
        }

        // Light blue/gray variations
        if (r >= 100 && r <= 200 && g >= 100 && g <= 200 && b >= 100 && b <= 220) {
            return 'available';
        }

        return 'unknown';
    }

    function isAvailableSeat(element) {
        // Check element background
        const bg = window.getComputedStyle(element).backgroundColor;
        let status = classifySeatColor(bg);

        if (status === 'available') return true;
        if (status === 'booked' || status === 'selected') return false;

        // Check parent background
        if (element.parentElement) {
            const parentBg = window.getComputedStyle(element.parentElement).backgroundColor;
            status = classifySeatColor(parentBg);
            if (status === 'available') return true;
            if (status === 'booked' || status === 'selected') return false;
        }

        // Check grandparent too
        if (element.parentElement?.parentElement) {
            const gpBg = window.getComputedStyle(element.parentElement.parentElement).backgroundColor;
            status = classifySeatColor(gpBg);
            if (status === 'available') return true;
            if (status === 'booked' || status === 'selected') return false;
        }

        // Default: if we can't determine, assume NOT available
        return false;
    }

    function findSeats() {
        const allSeats = [];
        const availableSeats = [];

        // Find all elements matching seat pattern (e.g., JHA-1, KA-15)
        const elements = document.querySelectorAll('div, span, button, td, li');

        for (const el of elements) {
            const text = el.textContent.trim();

            // Match seat pattern: LETTERS-NUMBER (e.g., JHA-1, KA-15, UMA-3)
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                const bg = window.getComputedStyle(el).backgroundColor;
                const parentBg = el.parentElement ? window.getComputedStyle(el.parentElement).backgroundColor : '';
                const isAvailable = isAvailableSeat(el);

                allSeats.push({ text, bg, isAvailable });

                if (isAvailable) {
                    availableSeats.push({
                        element: el,
                        text: text,
                        num: parseInt(text.split('-')[1])
                    });
                }
            }
        }

        // Log some samples for debugging
        if (allSeats.length > 0) {
            const samples = allSeats.slice(0, 5);
            samples.forEach(s => {
                log(`  Seat ${s.text}: bg=${s.bg.substring(0, 25)} avail=${s.isAvailable}`);
            });
        }

        availableSeats.sort((a, b) => a.num - b.num);
        log(`Found ${allSeats.length} seats, ${availableSeats.length} available`);

        return availableSeats;
    }

    async function clickSeat(seat) {
        log(`Clicking seat: ${seat.text}`, 'success');

        seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(500);

        // Highlight
        seat.element.style.outline = '4px solid #00ff00';
        seat.element.style.boxShadow = '0 0 20px 8px rgba(0,255,0,0.6)';

        // Click element
        seat.element.click();
        await delay(600);

        // Also click parent
        if (seat.element.parentElement) {
            seat.element.parentElement.click();
        }

        return true;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoSelectSeat() {
        log('=== AUTO SEAT SELECTION v2.3 ===', 'success');
        notify('🔍 Looking for seats...', 'info');

        const hasUI = await waitForSeatUI();
        if (!hasUI) {
            log('Seat UI not found', 'error');
            notify('⚠️ Seat selection not found', 'warning');
            return;
        }

        await delay(1500);

        // Check for seats already visible
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
            log('No dropdown found', 'error');
            notify('❌ Cannot find coach selector', 'error');
            return;
        }

        // Get coaches and sort by available seats
        const coaches = await getCoaches(dropdown);
        const withSeats = coaches.filter(c => c.seats > 0).sort((a, b) => b.seats - a.seats);

        if (withSeats.length === 0) {
            log('All coaches have 0 seats', 'error');
            notify('❌ No seats in any coach!', 'error');
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

            log(`No available seats in ${coach.name}`, 'warn');
        }

        log('Failed to select any seat', 'error');
        notify('❌ No available seats found', 'error');
    }

    // ========================================================================
    // INIT
    // ========================================================================

    log('Script loaded, starting in 3s...');
    setTimeout(autoSelectSeat, 3000);

    // Watch for URL changes
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            log('URL changed, restarting...');
            setTimeout(autoSelectSeat, 3000);
        }
    }).observe(document.body, { childList: true, subtree: true });

})();
