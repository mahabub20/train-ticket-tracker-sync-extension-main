// Auto-grab ticket content script
// Runs on: https://eticket.railway.gov.bd/booking/train/search*

(function () {
    'use strict';

    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const requestedClass = urlParams.get('class');
    const requestedTrain = urlParams.get('train');

    console.log('[Train Ticket Auto-Grab] Looking for train:', requestedTrain, 'class:', requestedClass);

    // Wait for the page to fully load train cards
    function waitForTrainCards() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 40; // 20 seconds max

            const checkInterval = setInterval(() => {
                // Look for train cards with train names
                const trainCards = document.querySelectorAll('.MuiCard-root, [class*="card"], [class*="Card"]');
                const bookButtons = document.querySelectorAll('button');
                const bookNowButtons = Array.from(bookButtons).filter(btn =>
                    btn.textContent.trim().toUpperCase() === 'BOOK NOW'
                );

                if (bookNowButtons.length > 0 || trainCards.length > 0) {
                    clearInterval(checkInterval);
                    // Wait a bit more for full render
                    setTimeout(() => resolve(true), 1000);
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

    // Get the train section that contains a specific train name
    function findTrainSection(trainName) {
        if (!trainName) return null;

        // Look for the train name in the page
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.children.length === 0 && el.textContent.includes(trainName)) {
                // Found the train name, now find the parent section/card
                let parent = el.parentElement;
                for (let i = 0; i < 10; i++) {
                    if (!parent) break;
                    // Check if this parent contains BOOK NOW buttons
                    const bookBtns = parent.querySelectorAll('button');
                    const hasBookNow = Array.from(bookBtns).some(btn =>
                        btn.textContent.trim().toUpperCase() === 'BOOK NOW'
                    );
                    if (hasBookNow) {
                        return parent;
                    }
                    parent = parent.parentElement;
                }
            }
        }
        return null;
    }

    // Find seat class card within a section
    function findSeatClassCard(section, className) {
        if (!section || !className) return null;

        // Look for elements containing the class name
        const allText = section.querySelectorAll('*');
        for (const el of allText) {
            if (el.textContent.includes(className)) {
                // Find the parent that contains a BOOK NOW button
                let parent = el;
                for (let i = 0; i < 8; i++) {
                    if (!parent) break;
                    const btn = parent.querySelector('button');
                    if (btn && btn.textContent.trim().toUpperCase() === 'BOOK NOW') {
                        return { card: parent, button: btn };
                    }
                    parent = parent.parentElement;
                }
            }
        }
        return null;
    }

    // Find any available BOOK NOW button in a section
    function findAnyAvailableInSection(section) {
        const buttons = section.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim().toUpperCase() === 'BOOK NOW') {
                // Check if the parent card shows available tickets
                let parent = btn.parentElement;
                for (let i = 0; i < 5; i++) {
                    if (!parent) break;
                    const text = parent.textContent;
                    // Check if available tickets > 0
                    if (text.match(/Available\s*Tickets[^0-9]*(\d+)/i)) {
                        const match = text.match(/Available\s*Tickets[^0-9]*(\d+)/i);
                        if (match && parseInt(match[1]) > 0) {
                            return btn;
                        }
                    }
                    parent = parent.parentElement;
                }
                // If we can't determine availability, return the button anyway
                return btn;
            }
        }
        return null;
    }

    // Fallback: find any BOOK NOW button on the page
    function findAnyBookNowButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim().toUpperCase() === 'BOOK NOW') {
                return btn;
            }
        }
        return null;
    }

    // Show notification
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
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
        } else {
            notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            notification.style.color = 'white';
        }

        notification.textContent = message;

        // Add animation style
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Remove after 6 seconds
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 6000);
    }

    // Highlight element
    function highlightElement(element) {
        if (element) {
            element.style.boxShadow = '0 0 20px 5px #27ae60';
            element.style.transition = 'box-shadow 0.3s ease';
        }
    }

    // Main function
    async function autoGrabTicket() {
        console.log('[Train Ticket Auto-Grab] Starting auto-grab...');

        const pageLoaded = await waitForTrainCards();

        if (!pageLoaded) {
            console.log('[Train Ticket Auto-Grab] Page did not load properly');
            showNotification('Page loading issue. Please try manually.', 'error');
            return;
        }

        let buttonToClick = null;
        let selectedInfo = '';

        // Strategy 1: Find specific train section first
        if (requestedTrain) {
            console.log('[Train Ticket Auto-Grab] Looking for train:', requestedTrain);
            const trainSection = findTrainSection(requestedTrain);

            if (trainSection) {
                console.log('[Train Ticket Auto-Grab] Found train section');

                // Try to find the specific class
                if (requestedClass) {
                    const seatCard = findSeatClassCard(trainSection, requestedClass);
                    if (seatCard && seatCard.button) {
                        buttonToClick = seatCard.button;
                        selectedInfo = `${requestedTrain} - ${requestedClass}`;
                        highlightElement(seatCard.card);
                        console.log('[Train Ticket Auto-Grab] Found exact match!');
                    }
                }

                // If specific class not found, get any available in this train
                if (!buttonToClick) {
                    buttonToClick = findAnyAvailableInSection(trainSection);
                    if (buttonToClick) {
                        selectedInfo = `${requestedTrain} (different class)`;
                        showNotification(`${requestedClass} not available. Selecting another class for ${requestedTrain}`, 'warning');
                    }
                }
            } else {
                console.log('[Train Ticket Auto-Grab] Train not found on page');
            }
        }

        // Strategy 2: Fallback to any BOOK NOW button
        if (!buttonToClick) {
            console.log('[Train Ticket Auto-Grab] Using fallback - finding any available ticket');
            buttonToClick = findAnyBookNowButton();
            if (buttonToClick) {
                selectedInfo = 'First available ticket';
                showNotification('Specific train not found. Selecting first available.', 'warning');
            }
        }

        // Click the button
        if (buttonToClick) {
            console.log('[Train Ticket Auto-Grab] Clicking button for:', selectedInfo);

            // Small delay before clicking
            await new Promise(resolve => setTimeout(resolve, 500));

            buttonToClick.scrollIntoView({ behavior: 'smooth', block: 'center' });

            await new Promise(resolve => setTimeout(resolve, 300));

            buttonToClick.click();

            showNotification(`✓ Selected: ${selectedInfo}`, 'success');
        } else {
            console.log('[Train Ticket Auto-Grab] No available tickets found');
            showNotification('No tickets available!', 'error');
        }
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        setTimeout(autoGrabTicket, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(autoGrabTicket, 1500));
    }
})();
