// Auto-select seat content script
// Runs on: https://eticket.railway.gov.bd/booking/train/seat-selection*

(function () {
    'use strict';

    console.log('[Train Ticket Auto-Seat] Seat selection page detected');

    // Wait for page to fully load with coaches
    function waitForCoaches() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 40; // 20 seconds max

            const checkInterval = setInterval(() => {
                // Look for coach dropdown or seat elements
                const coachDropdown = document.querySelector('select, [class*="select"], [class*="dropdown"]');
                const seatElements = document.querySelectorAll('[class*="seat"], [class*="Seat"], button[class*="CHA"], div[class*="CHA"]');

                if (coachDropdown || seatElements.length > 0) {
                    clearInterval(checkInterval);
                    setTimeout(() => resolve(true), 1500); // Wait for full render
                } else {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }
            }, 500);
        });
    }

    // Get all coach options
    function getCoachOptions() {
        // Find the coach dropdown/select
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
            const options = select.querySelectorAll('option');
            if (options.length > 0) {
                // Check if this looks like a coach selector
                const text = select.textContent || '';
                if (text.includes('CHA') || text.includes('Seat') || text.includes('Coach')) {
                    return { select, options: Array.from(options) };
                }
            }
        }

        // Also check for MUI Select or custom dropdowns
        const muiSelects = document.querySelectorAll('[class*="MuiSelect"], [class*="select"]');
        for (const select of muiSelects) {
            if (select.textContent.includes('CHA') || select.textContent.includes('Seat')) {
                return { select, type: 'mui' };
            }
        }

        return null;
    }

    // Find available seats in current view
    function findAvailableSeats() {
        const availableSeats = [];

        // Look for seat buttons/elements that are available (not booked/in-progress)
        // Available seats are typically white/gray, not orange/red
        const allButtons = document.querySelectorAll('button, div[role="button"], span[class*="seat"]');

        for (const btn of allButtons) {
            const text = btn.textContent.trim();
            const className = btn.className || '';
            const style = window.getComputedStyle(btn);
            const bgColor = style.backgroundColor;

            // Check if it looks like a seat (CHA-1, CHA-2, etc. or just numbers)
            if (text.match(/^(CHA-?\d+|\d+|[A-Z]-?\d+)$/i)) {
                // Check if it's available (not in progress, not booked)
                // Available seats are usually gray/white with specific styling
                const isBooked = className.includes('booked') ||
                    className.includes('Booked') ||
                    className.includes('progress') ||
                    className.includes('Progress') ||
                    bgColor.includes('rgb(255, 152') || // Orange
                    bgColor.includes('rgb(244, 67'); // Red

                const isAvailable = className.includes('available') ||
                    className.includes('Available') ||
                    (!isBooked && (bgColor.includes('rgb(255, 255, 255)') || // White
                        bgColor.includes('rgb(245') || // Light gray
                        bgColor.includes('rgb(238') || // Light gray
                        bgColor.includes('rgb(224'))); // Light gray

                if (!isBooked) {
                    availableSeats.push({
                        element: btn,
                        text: text,
                        isAvailable: isAvailable
                    });
                }
            }
        }

        // Also look for seats by their visual appearance
        const seatDivs = document.querySelectorAll('div, button');
        for (const div of seatDivs) {
            const text = div.textContent.trim();
            if (text.match(/^CHA-\d+$/)) {
                const bgColor = window.getComputedStyle(div).backgroundColor;
                // Gray/white colors indicate available
                if (bgColor.includes('rgb(158') || bgColor.includes('rgb(189') || bgColor.includes('rgb(224')) {
                    if (!availableSeats.find(s => s.text === text)) {
                        availableSeats.push({
                            element: div,
                            text: text,
                            isAvailable: true
                        });
                    }
                }
            }
        }

        return availableSeats;
    }

    // Select a coach from dropdown
    async function selectCoach(coachInfo, coachIndex) {
        if (!coachInfo) return false;

        if (coachInfo.type === 'mui') {
            // Click to open dropdown
            coachInfo.select.click();
            await new Promise(r => setTimeout(r, 500));

            // Find and click the option
            const menuItems = document.querySelectorAll('[role="option"], [class*="MenuItem"], li');
            if (menuItems[coachIndex]) {
                menuItems[coachIndex].click();
                await new Promise(r => setTimeout(r, 1000));
                return true;
            }
        } else if (coachInfo.select && coachInfo.options) {
            // Regular select element
            if (coachInfo.options[coachIndex]) {
                coachInfo.select.value = coachInfo.options[coachIndex].value;
                coachInfo.select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(r => setTimeout(r, 1000));
                return true;
            }
        }
        return false;
    }

    // Show notification
    function showNotification(message, type = 'success') {
        // Remove existing notifications
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

        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
            notification.style.color = 'white';
        } else if (type === 'warning') {
            notification.style.background = 'linear-gradient(135deg, #f39c12, #f1c40f)';
            notification.style.color = '#333';
        } else if (type === 'info') {
            notification.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
            notification.style.color = 'white';
        } else {
            notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            notification.style.color = 'white';
        }

        notification.textContent = message;

        // Add animation style
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

        // Remove after appropriate time
        const duration = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // Main function to find and select seat
    async function autoSelectSeat() {
        console.log('[Train Ticket Auto-Seat] Starting seat search...');

        const pageReady = await waitForCoaches();
        if (!pageReady) {
            showNotification('Page loading issue. Please select manually.', 'error');
            return;
        }

        showNotification('Searching for available seats...', 'info');

        // Get coach dropdown info
        const coachInfo = getCoachOptions();
        const totalCoaches = coachInfo?.options?.length || 20; // Default to 20 coaches

        let seatFound = false;
        let checkedCoaches = 0;

        // First check current view for available seats
        let availableSeats = findAvailableSeats();
        console.log('[Train Ticket Auto-Seat] Found', availableSeats.length, 'potential seats in current view');

        // Look for seats that appear available (gray background)
        for (const seat of availableSeats) {
            if (seat.isAvailable) {
                console.log('[Train Ticket Auto-Seat] Found available seat:', seat.text);
                seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 300));

                // Highlight and click
                seat.element.style.boxShadow = '0 0 20px 5px #27ae60';
                seat.element.style.transition = 'box-shadow 0.3s ease';

                await new Promise(r => setTimeout(r, 200));
                seat.element.click();

                seatFound = true;
                showNotification(`✓ Selected seat: ${seat.text}`, 'success');
                return;
            }
        }

        // If no available seat in current view, try other coaches
        if (coachInfo && coachInfo.options) {
            for (let i = 0; i < coachInfo.options.length && !seatFound; i++) {
                checkedCoaches++;
                console.log('[Train Ticket Auto-Seat] Checking coach', i + 1, 'of', coachInfo.options.length);

                const selected = await selectCoach(coachInfo, i);
                if (selected) {
                    await new Promise(r => setTimeout(r, 800));

                    const seats = findAvailableSeats();
                    for (const seat of seats) {
                        if (seat.isAvailable) {
                            console.log('[Train Ticket Auto-Seat] Found available seat in coach', i + 1, ':', seat.text);
                            seat.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 300));

                            seat.element.style.boxShadow = '0 0 20px 5px #27ae60';
                            seat.element.click();

                            seatFound = true;
                            showNotification(`✓ Found and selected seat: ${seat.text}`, 'success');
                            return;
                        }
                    }
                }
            }
        }

        // If still no seat found, try clicking on gray/available-looking seats directly
        if (!seatFound) {
            const allDivs = document.querySelectorAll('div, button, span');
            for (const div of allDivs) {
                const text = div.textContent.trim();
                if (text.match(/^CHA-\d+$/) && div.children.length === 0) {
                    const bgColor = window.getComputedStyle(div).backgroundColor;
                    // Gray colors (available seats)
                    if (bgColor.includes('158, 158, 158') || bgColor.includes('189, 189, 189') ||
                        bgColor.includes('224, 224, 224') || bgColor.includes('rgb(158') ||
                        bgColor.includes('rgb(189') || bgColor.includes('rgb(224')) {
                        console.log('[Train Ticket Auto-Seat] Clicking gray seat:', text);
                        div.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await new Promise(r => setTimeout(r, 300));
                        div.click();
                        seatFound = true;
                        showNotification(`✓ Selected seat: ${text}`, 'success');
                        return;
                    }
                }
            }
        }

        if (!seatFound) {
            console.log('[Train Ticket Auto-Seat] No available seats found after checking', checkedCoaches, 'coaches');
            showNotification('❌ No available seats found in any coach!', 'error');
        }
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        setTimeout(autoSelectSeat, 2000);
    } else {
        window.addEventListener('load', () => setTimeout(autoSelectSeat, 2000));
    }
})();
