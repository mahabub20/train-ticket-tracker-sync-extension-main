// Enhanced Auto-select seat content script
// Runs on seat selection pages
// Version 2.0 - Improved coach switching and seat detection

(function () {
    'use strict';

    console.log('[Train Ticket Auto-Seat] ===== SCRIPT LOADED (Enhanced v2.0) =====');

    // Configuration
    const CONFIG = {
        MAX_WAIT_ATTEMPTS: 60,      // 30 seconds max wait
        POLL_INTERVAL: 500,         // 500ms between checks
        COACH_SWITCH_DELAY: 2000,   // Wait after switching coach
        SEAT_CLICK_DELAY: 500,      // Delay between seat click attempts
        NOTIFICATION_DURATION: 5000 // 5 seconds
    };

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Show notification banner
    function showNotification(message, type = 'info') {
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
            animation: slideIn 0.3s ease;
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

        if (!document.querySelector('#auto-seat-styles')) {
            const style = document.createElement('style');
            style.id = 'auto-seat-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, type === 'error' ? 10000 : CONFIG.NOTIFICATION_DURATION);
    }

    // ========================================================================
    // PAGE DETECTION
    // ========================================================================

    // Wait for page to be ready with coach selector
    function waitForPageReady() {
        return new Promise((resolve) => {
            let attempts = 0;

            const checkInterval = setInterval(() => {
                // Look for coach dropdown - multiple selectors for different UIs
                const coachDropdown = findCoachDropdown();
                const coachText = document.body.innerText;

                // Check if we have the coach selector UI
                if (coachDropdown || coachText.includes('Select Coach') || coachText.includes('Seat(s)')) {
                    clearInterval(checkInterval);
                    setTimeout(() => resolve(true), 1000);
                } else {
                    attempts++;
                    if (attempts >= CONFIG.MAX_WAIT_ATTEMPTS) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }
            }, CONFIG.POLL_INTERVAL);
        });
    }

    // ========================================================================
    // COACH DROPDOWN DETECTION & HANDLING
    // ========================================================================

    // Find the coach dropdown element
    function findCoachDropdown() {
        // Strategy 1: Look for select element with coach options
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
            const optionsText = Array.from(select.options).map(o => o.text).join(' ');
            if (optionsText.includes('Seat(s)') || optionsText.match(/[A-Z]+-/)) {
                console.log('[Train Ticket Auto-Seat] Found <select> dropdown');
                return { type: 'select', element: select };
            }
        }

        // Strategy 2: Look for custom dropdown (MUI, etc.)
        // Find elements containing "Seat(s)" pattern like "KA - 5 Seat(s)"
        const allDivs = document.querySelectorAll('div, span');
        for (const el of allDivs) {
            const text = el.textContent.trim();
            // Match patterns like "KA - 0 Seat(s)" or "GHA - 5 Seat(s)"
            if (text.match(/^[A-Z]+\s*-\s*\d+\s*Seat\(s\)$/)) {
                // Check if this is clickable (has click handler or role)
                const parent = el.closest('[role="button"], [role="combobox"], .MuiSelect-root, [class*="Select"], [class*="Dropdown"]');
                if (parent) {
                    console.log('[Train Ticket Auto-Seat] Found custom dropdown:', text);
                    return { type: 'custom', element: parent, display: el };
                }
                // Even without role, might be clickable
                console.log('[Train Ticket Auto-Seat] Found potential dropdown:', text);
                return { type: 'custom', element: el.parentElement || el, display: el };
            }
        }

        // Strategy 3: Look for "Select Coach" label and find adjacent dropdown
        const labels = document.querySelectorAll('*');
        for (const label of labels) {
            if (label.textContent.trim() === 'Select Coach' && label.children.length === 0) {
                // Find the next sibling or parent's next child that could be dropdown
                let container = label.parentElement;
                if (container) {
                    const dropdown = container.querySelector('select, [role="button"], [role="combobox"], [class*="Select"]');
                    if (dropdown) {
                        console.log('[Train Ticket Auto-Seat] Found dropdown via label');
                        return { type: dropdown.tagName === 'SELECT' ? 'select' : 'custom', element: dropdown };
                    }
                }
            }
        }

        return null;
    }

    // Get all coaches with their seat counts
    async function getCoachOptions(dropdownInfo) {
        const coaches = [];

        if (dropdownInfo.type === 'select') {
            const select = dropdownInfo.element;
            for (let i = 0; i < select.options.length; i++) {
                const option = select.options[i];
                const text = option.text;
                const match = text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
                if (match) {
                    coaches.push({
                        name: match[1],
                        seats: parseInt(match[2]),
                        index: i,
                        element: option,
                        text: text
                    });
                }
            }
        } else {
            // Custom dropdown - need to open it first
            const trigger = dropdownInfo.element;
            trigger.click();
            await delay(500);

            // Look for dropdown options in the DOM
            const options = document.querySelectorAll('li[role="option"], [role="option"], [class*="MenuItem"], [class*="Option"]');

            for (const option of options) {
                const text = option.textContent.trim();
                const match = text.match(/([A-Z]+)\s*-\s*(\d+)\s*Seat/);
                if (match) {
                    coaches.push({
                        name: match[1],
                        seats: parseInt(match[2]),
                        element: option,
                        text: text
                    });
                }
            }

            // Close dropdown by clicking elsewhere
            document.body.click();
            await delay(300);
        }

        console.log('[Train Ticket Auto-Seat] Found coaches:', coaches.map(c => `${c.name}: ${c.seats} seats`));
        return coaches;
    }

    // Select a specific coach
    async function selectCoach(dropdownInfo, coach) {
        console.log('[Train Ticket Auto-Seat] Selecting coach:', coach.name);
        showNotification(`Selecting coach ${coach.name} (${coach.seats} seats)...`, 'info');

        if (dropdownInfo.type === 'select') {
            const select = dropdownInfo.element;
            select.selectedIndex = coach.index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // Open dropdown
            dropdownInfo.element.click();
            await delay(500);

            // Click the option
            coach.element.click();
        }

        // Wait for seats to load
        await delay(CONFIG.COACH_SWITCH_DELAY);
    }

    // ========================================================================
    // SEAT DETECTION & SELECTION
    // ========================================================================

    // Check if a color is gray (available seat indicator)
    function isAvailableColor(element) {
        const bgColor = window.getComputedStyle(element).backgroundColor;
        const parentBg = element.parentElement ? window.getComputedStyle(element.parentElement).backgroundColor : '';

        function checkGray(rgb) {
            if (!rgb) return false;
            const match = rgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (!match) return false;

            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);

            // Gray: R≈G≈B, all in range 100-220
            const isGray = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;
            const inRange = r >= 100 && r <= 230 && g >= 100 && g <= 230 && b >= 100 && b <= 230;

            return isGray && inRange;
        }

        return checkGray(bgColor) || checkGray(parentBg);
    }

    // Find all visible seats on the page
    function findAllSeats() {
        const seats = [];
        const allElements = document.querySelectorAll('div, span, button');

        for (const el of allElements) {
            const text = el.textContent.trim();

            // Match seat patterns: KA-1, GHA-5, CHA-10, etc.
            if (text.match(/^[A-Z]+-\d+$/) && el.children.length === 0) {
                const isAvailable = isAvailableColor(el);

                seats.push({
                    element: el,
                    text: text,
                    seatNum: parseInt(text.split('-')[1]),
                    isAvailable: isAvailable
                });
            }
        }

        return seats;
    }

    // Find available seats only
    function findAvailableSeats() {
        return findAllSeats().filter(s => s.isAvailable).sort((a, b) => a.seatNum - b.seatNum);
    }

    // Click on a seat element
    async function clickSeat(seatInfo) {
        console.log('[Train Ticket Auto-Seat] Clicking seat:', seatInfo.text);

        // Scroll to seat
        seatInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);

        // Try clicking the element
        seatInfo.element.click();
        await delay(CONFIG.SEAT_CLICK_DELAY);

        // Also try clicking parent (some UIs need this)
        if (seatInfo.element.parentElement) {
            seatInfo.element.parentElement.click();
        }
        await delay(CONFIG.SEAT_CLICK_DELAY);

        // Highlight the selected seat
        seatInfo.element.style.outline = '4px solid #27ae60';
        seatInfo.element.style.boxShadow = '0 0 10px 3px #27ae60';

        return true;
    }

    // ========================================================================
    // MAIN LOGIC
    // ========================================================================

    async function autoSelectSeat() {
        console.log('[Train Ticket Auto-Seat] Starting auto seat selection...');
        showNotification('🔍 Starting seat selection...', 'info');

        // Step 1: Wait for page to be ready
        const pageReady = await waitForPageReady();
        if (!pageReady) {
            showNotification('⚠️ Page loading issue. Please select manually.', 'warning');
            return;
        }

        // Step 2: Find the coach dropdown
        const dropdownInfo = findCoachDropdown();

        if (!dropdownInfo) {
            console.log('[Train Ticket Auto-Seat] No coach dropdown found, trying direct seat selection');
            // Maybe seats are already visible without coach selection
            const availableSeats = findAvailableSeats();
            if (availableSeats.length > 0) {
                await clickSeat(availableSeats[0]);
                showNotification(`✓ Selected seat: ${availableSeats[0].text}`, 'success');
                return;
            }
            showNotification('❌ Could not find coach dropdown or seats', 'error');
            return;
        }

        // Step 3: Get all coach options
        const coaches = await getCoachOptions(dropdownInfo);

        if (coaches.length === 0) {
            showNotification('❌ No coaches found', 'error');
            return;
        }

        // Step 4: Sort coaches by available seats (highest first)
        const coachesWithSeats = coaches.filter(c => c.seats > 0).sort((a, b) => b.seats - a.seats);

        if (coachesWithSeats.length === 0) {
            showNotification('❌ No seats available in any coach!', 'error');
            return;
        }

        console.log('[Train Ticket Auto-Seat] Coaches with seats:', coachesWithSeats.map(c => `${c.name}: ${c.seats}`));

        // Step 5: Try each coach until we find an available seat
        for (const coach of coachesWithSeats) {
            showNotification(`🔄 Checking ${coach.name} (${coach.seats} seats)...`, 'info');

            // Select this coach
            await selectCoach(dropdownInfo, coach);

            // Wait a bit more for seats to render
            await delay(1500);

            // Look for available seats
            const availableSeats = findAvailableSeats();
            console.log(`[Train Ticket Auto-Seat] Found ${availableSeats.length} available seats in ${coach.name}`);

            if (availableSeats.length > 0) {
                // Select the first available seat
                await clickSeat(availableSeats[0]);
                showNotification(`✓ Selected seat ${availableSeats[0].text} in coach ${coach.name}!`, 'success');
                return;
            }
        }

        // If we get here, no seats were found
        showNotification('❌ Could not select a seat. Please try manually.', 'error');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    // Run when page is ready
    if (document.readyState === 'complete') {
        setTimeout(autoSelectSeat, 2000);
    } else {
        window.addEventListener('load', () => setTimeout(autoSelectSeat, 2000));
    }

    // Also listen for URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.includes('seat')) {
                console.log('[Train Ticket Auto-Seat] URL changed, rerunning...');
                setTimeout(autoSelectSeat, 2000);
            }
        }
    }).observe(document.body, { subtree: true, childList: true });

})();
