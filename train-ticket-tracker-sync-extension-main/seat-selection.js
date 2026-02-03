// Auto-select seat content script
// Runs on seat selection pages

(function () {
    'use strict';

    // Immediate log to confirm script loaded
    console.log('[Train Ticket Auto-Seat] ===== SCRIPT LOADED =====');
    console.log('[Train Ticket Auto-Seat] Current URL:', window.location.href);
    console.log('[Train Ticket Auto-Seat] Seat selection page detected');

    // Wait for page to fully load with seats
    function waitForSeats() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 60; // 30 seconds max

            const checkInterval = setInterval(() => {
                // Look for seat elements - they have text like CHA-1, CHA-2, etc.
                const allElements = document.querySelectorAll('div, span, button');
                let seatCount = 0;

                for (const el of allElements) {
                    if (el.textContent.match(/^CHA-\d+$/) && el.children.length === 0) {
                        seatCount++;
                    }
                }

                console.log('[Train Ticket Auto-Seat] Found', seatCount, 'seat elements');

                if (seatCount > 10) {
                    clearInterval(checkInterval);
                    setTimeout(() => resolve(true), 2000); // Wait for full render
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
        const duration = type === 'error' ? 10000 : 5000;
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // RGB to check if color is gray (available seat)
    function isGrayColor(rgbString) {
        // Gray colors have similar R, G, B values
        // Available seats in the screenshot appear gray: rgb(158, 158, 158) or similar
        const match = rgbString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!match) return false;

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        // Check if it's a gray color (R, G, B are close to each other) and in the gray range
        const isGray = Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20;
        const isInGrayRange = r >= 100 && r <= 200 && g >= 100 && g <= 200 && b >= 100 && b <= 200;

        return isGray && isInGrayRange;
    }

    // Check if color is orange (booked/in progress seat)
    function isOrangeColor(rgbString) {
        const match = rgbString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!match) return false;

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        // Orange: high red, medium green, low blue
        return r > 200 && g > 100 && g < 200 && b < 100;
    }

    // Find all available seats
    function findAvailableSeats() {
        const availableSeats = [];
        const allElements = document.querySelectorAll('div, span, button');

        for (const el of allElements) {
            const text = el.textContent.trim();

            // Check if this is a seat element (CHA-1, CHA-2, etc.)
            if (text.match(/^CHA-\d+$/) && el.children.length === 0) {
                const bgColor = window.getComputedStyle(el).backgroundColor;
                const parentBgColor = el.parentElement ? window.getComputedStyle(el.parentElement).backgroundColor : '';

                console.log('[Train Ticket Auto-Seat] Seat', text, '- bg:', bgColor);

                // Check if it's an available (gray) seat
                if (isGrayColor(bgColor) || isGrayColor(parentBgColor)) {
                    availableSeats.push({
                        element: el,
                        text: text,
                        seatNum: parseInt(text.replace('CHA-', ''))
                    });
                    console.log('[Train Ticket Auto-Seat] ✓ Available seat found:', text);
                } else if (!isOrangeColor(bgColor) && !isOrangeColor(parentBgColor)) {
                    // If not orange, might still be available - check more
                    // Sometimes available seats have white or light background
                    const match = bgColor.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                    if (match) {
                        const r = parseInt(match[1]);
                        const g = parseInt(match[2]);
                        const b = parseInt(match[3]);

                        // Light gray or white-ish colors
                        if (r >= 150 && g >= 150 && b >= 150 && r < 230 && g < 230) {
                            availableSeats.push({
                                element: el,
                                text: text,
                                seatNum: parseInt(text.replace('CHA-', ''))
                            });
                            console.log('[Train Ticket Auto-Seat] ✓ Potentially available seat:', text);
                        }
                    }
                }
            }
        }

        // Sort by seat number
        availableSeats.sort((a, b) => a.seatNum - b.seatNum);

        return availableSeats;
    }

    // Click seat and verify selection
    async function clickSeat(seatInfo) {
        console.log('[Train Ticket Auto-Seat] Clicking seat:', seatInfo.text);

        // Scroll into view
        seatInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 500));

        // Try clicking the element
        seatInfo.element.click();
        await new Promise(r => setTimeout(r, 500));

        // Also try clicking parent if element itself didn't work
        if (seatInfo.element.parentElement) {
            seatInfo.element.parentElement.click();
        }

        await new Promise(r => setTimeout(r, 1000));

        // Check if selection worked by looking at the Seat Details section
        const seatDetails = document.body.textContent;
        if (seatDetails.includes(seatInfo.text)) {
            console.log('[Train Ticket Auto-Seat] ✓ Seat selected successfully!');
            return true;
        }

        return false;
    }

    // Main function
    async function autoSelectSeat() {
        console.log('[Train Ticket Auto-Seat] Starting seat search...');

        const pageReady = await waitForSeats();
        if (!pageReady) {
            showNotification('Page loading issue. Please select manually.', 'error');
            return;
        }

        showNotification('🔍 Searching for available seats...', 'info');

        // Find all available seats
        const availableSeats = findAvailableSeats();

        console.log('[Train Ticket Auto-Seat] Found', availableSeats.length, 'available seats');

        if (availableSeats.length === 0) {
            showNotification('❌ No available seats found! All seats are booked.', 'error');
            return;
        }

        // Try to click the first available seat
        for (const seat of availableSeats) {
            showNotification(`Trying seat ${seat.text}...`, 'info');

            const success = await clickSeat(seat);

            if (success) {
                showNotification(`✓ Selected seat: ${seat.text}. Click "CONTINUE PURCHASE" to proceed!`, 'success');

                // Highlight the seat
                seat.element.style.outline = '3px solid #27ae60';
                seat.element.style.boxShadow = '0 0 15px 5px rgba(39, 174, 96, 0.5)';

                return;
            }
        }

        // If we tried all seats and none worked, try a different approach
        // Just click the first gray element we find
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text.match(/^CHA-\d+$/) && el.children.length === 0) {
                const bgColor = window.getComputedStyle(el).backgroundColor;
                if (isGrayColor(bgColor)) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 300));
                    el.click();
                    await new Promise(r => setTimeout(r, 500));

                    showNotification(`✓ Clicked seat: ${text}. Check if it's selected!`, 'success');
                    return;
                }
            }
        }

        showNotification('❌ Could not select any seat. Please select manually.', 'error');
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        setTimeout(autoSelectSeat, 3000);
    } else {
        window.addEventListener('load', () => setTimeout(autoSelectSeat, 3000));
    }
})();
