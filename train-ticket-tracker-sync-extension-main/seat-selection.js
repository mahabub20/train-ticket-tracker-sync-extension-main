// Enhanced Auto-select seat content script
// Version 3.0 - Multi-seat selection from Chrome storage
// Available = light gray/white, Booked = orange, Selected = teal/green

(function () {
    'use strict';

    if (window.__autoSeatInitialized) {
        console.log('[Auto-Seat] Already initialized');
        return;
    }
    window.__autoSeatInitialized = true;

    // ========================================================================
    // DRAGGABLE DEBUG PANEL
    // ========================================================================

    let logContainer = null;
    let targetSeatCount = 1; // Will be loaded from storage

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
        const existing = document.querySelector('#auto-seat-debug-panel');
        if (existing) return existing.querySelector('#debug-log-container');

        const panel = document.createElement('div');
        panel.id = 'auto-seat-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 10px; left: 10px; width: 400px; max-height: 280px;
            background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace; font-size: 11px;
            padding: 0; border-radius: 8px; z-index: 999999; overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #333;
        `;

        const header = document.createElement('div');
        header.className = 'drag-header';
        header.style.cssText = `
            font-weight: bold; padding: 8px 10px; color: #0ff; font-size: 12px;
            background: linear-gradient(135deg, #1a1a2e, #16213e); 
            border-bottom: 1px solid #333; user-select: none;
            display: flex; justify-content: space-between; align-items: center;
        `;
        header.innerHTML = '<span>🎫 Auto-Seat v3.0 (Multi-Seat)</span><span style="color:#666;font-size:10px;">⠿ drag</span>';
        panel.appendChild(header);

        const container = document.createElement('div');
        container.id = 'debug-log-container';
        container.style.cssText = 'padding: 10px; max-height: 230px; overflow-y: auto;';
        panel.appendChild(container);

        document.body.appendChild(panel);
        makeDraggable(panel);

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
    // LOAD SEAT COUNT FROM STORAGE
    // ========================================================================

    async function loadSeatCount() {
        try {
            const result = await chrome.storage.local.get(['targetSeatCount']);
            targetSeatCount = parseInt(result.targetSeatCount) || 1;
            // Ensure max 4
            if (targetSeatCount > 4) targetSeatCount = 4;
            if (targetSeatCount < 1) targetSeatCount = 1;
            log(`Target seat count: ${targetSeatCount}`, 'success');
        } catch (e) {
            log('Could not load seat count, using 1', 'warn');
            targetSeatCount = 1;
        }
    }

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

        log('No select dropdown found', 'warn');
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

        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));

        await delay(2000);
    }

    // ========================================================================
    // SEAT COLOR DETECTION
    // ========================================================================

    function classifySeatColor(bgColor) {
        if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
            return 'unknown';
        }

        const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return 'unknown';

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        // Orange = booked (200+, 100-180, 0-100)
        if (r > 200 && g > 80 && g < 180 && b < 100) return 'booked';

        // Green/Teal = selected (0-100, 150+, 100+)
        if (r < 100 && g > 140 && b > 100) return 'selected';
        if (g > 180 && b > 140 && r < 150) return 'selected';

        // Light gray/white = available (all > 180)
        if (r > 180 && g > 180 && b > 180) return 'available';

        // Medium gray = available (130-200 all similar)
        if (r > 130 && g > 130 && b > 130 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'available';

        return 'unknown';
    }

    function isAvailableSeat(element) {
        const bg = window.getComputedStyle(element).backgroundColor;
        let status = classifySeatColor(bg);

        if (status === 'available') return true;
        if (status === 'booked' || status === 'selected') return false;

        if (element.parentElement) {
            const parentBg = window.getComputedStyle(element.parentElement).backgroundColor;
            status = classifySeatColor(parentBg);
            if (status === 'available') return true;
            if (status === 'booked' || status === 'selected') return false;
        }

        if (element.parentElement && element.parentElement.parentElement) {
            const grandBg = window.getComputedStyle(element.parentElement.parentElement).backgroundColor;
            status = classifySeatColor(grandBg);
            if (status === 'available') return true;
            if (status === 'booked' || status === 'selected') return false;
        }

        return false;
    }

    function findSeats() {
        const allSeats = [];
        const availableSeats = [];
        const elements = document.querySelectorAll('div, span, button, td, li');

        for (const el of elements) {
            const text = el.textContent.trim();
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                const isAvailable = isAvailableSeat(el);
                allSeats.push({ text, isAvailable });
                if (isAvailable) {
                    availableSeats.push({
                        element: el,
                        text: text,
                        num: parseInt(text.split('-')[1])
                    });
                }
            }
        }

        availableSeats.sort((a, b) => a.num - b.num);
        log(`Found ${allSeats.length} seats, ${availableSeats.length} available`);
        return availableSeats;
    }

    async function clickSeat(seat) {
        log(`Clicking seat: ${seat.text}`, 'success');
        seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);
        seat.element.style.outline = '4px solid #00ff00';
        seat.element.style.boxShadow = '0 0 20px 8px rgba(0,255,0,0.6)';
        seat.element.click();
        await delay(400);
        if (seat.element.parentElement) seat.element.parentElement.click();
        return true;
    }

    // ========================================================================
    // MULTI-SEAT SELECTION
    // ========================================================================

    async function selectMultipleSeats(availableSeats, count) {
        const selectedSeats = [];
        const toSelect = Math.min(count, availableSeats.length, 4); // Max 4

        log(`Selecting ${toSelect} seats...`, 'success');

        for (let i = 0; i < toSelect; i++) {
            const seat = availableSeats[i];
            await clickSeat(seat);
            selectedSeats.push(seat.text);
            await delay(500); // Wait between clicks
        }

        return selectedSeats;
    }

    // ========================================================================
    // MAIN
    // ========================================================================

    async function autoSelectSeat() {
        log('=== AUTO SEAT v3.0 (Multi-Seat) ===', 'success');

        // Load seat count from storage
        await loadSeatCount();

        notify(`🔍 Looking for ${targetSeatCount} seat(s)...`, 'info');

        const hasUI = await waitForSeatUI();
        if (!hasUI) {
            notify('⚠️ Seat selection not found', 'warning');
            return;
        }

        await delay(1500);

        let available = findSeats();

        // Check if we have enough seats
        if (available.length >= targetSeatCount) {
            const selected = await selectMultipleSeats(available, targetSeatCount);
            notify(`✓ Selected ${selected.length} seat(s): ${selected.join(', ')}`, 'success');
            return;
        }

        // If not enough seats in current coach, try other coaches
        if (available.length > 0 && available.length < targetSeatCount) {
            log(`Only ${available.length} seats here, but need ${targetSeatCount}`, 'warn');
        }

        const dropdown = findCoachDropdown();
        if (!dropdown) {
            // If no dropdown but some seats available, select what we can
            if (available.length > 0) {
                const selected = await selectMultipleSeats(available, targetSeatCount);
                notify(`✓ Selected ${selected.length}/${targetSeatCount} seat(s): ${selected.join(', ')}`, 'warning');
                return;
            }
            notify('❌ Cannot find coach selector', 'error');
            return;
        }

        const coaches = await getCoaches(dropdown);
        // Sort by available seats, prioritize coaches with enough seats for all
        const withSeats = coaches.filter(c => c.seats > 0).sort((a, b) => {
            // Prioritize coaches with at least targetSeatCount seats
            if (a.seats >= targetSeatCount && b.seats < targetSeatCount) return -1;
            if (b.seats >= targetSeatCount && a.seats < targetSeatCount) return 1;
            return b.seats - a.seats;
        });

        if (withSeats.length === 0) {
            notify('❌ No seats in any coach!', 'error');
            return;
        }

        for (const coach of withSeats) {
            await selectCoach(dropdown, coach);
            available = findSeats();

            if (available.length >= targetSeatCount) {
                const selected = await selectMultipleSeats(available, targetSeatCount);
                notify(`✓ ${selected.length} seat(s) in ${coach.name}: ${selected.join(', ')}`, 'success');
                return;
            } else if (available.length > 0) {
                // Partial selection - might be acceptable
                log(`${coach.name} has ${available.length} (need ${targetSeatCount})`, 'warn');
            }
        }

        // If we couldn't find a coach with enough seats, select from the best available
        for (const coach of withSeats) {
            await selectCoach(dropdown, coach);
            available = findSeats();
            if (available.length > 0) {
                const selected = await selectMultipleSeats(available, Math.min(available.length, targetSeatCount));
                notify(`⚠️ Only ${selected.length}/${targetSeatCount} seats: ${selected.join(', ')}`, 'warning');
                return;
            }
        }

        notify('❌ No available seats found', 'error');
    }

    log('Script loaded');
    setTimeout(autoSelectSeat, 3000);

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(autoSelectSeat, 3000);
        }
    }).observe(document.body, { childList: true, subtree: true });

})();
