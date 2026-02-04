// Webapp Listener - Runs on Train Ticket Notifier web app
// Listens for target selection events and saves to Chrome storage
// This allows the Buy button to automatically set the target train/class

(function () {
    'use strict';

    console.log('[Train Tracker Extension] Webapp listener loaded');

    // Listen for custom event from the page
    window.addEventListener('trainTargetSelected', async (event) => {
        const { trainNumber, trainClass, trainName } = event.detail || {};

        console.log('[Train Tracker Extension] Target received:', { trainNumber, trainClass, trainName });

        if (trainNumber || trainClass) {
            try {
                await chrome.storage.local.set({
                    targetTrainNumber: trainNumber || '',
                    targetTrainClass: trainClass || '',
                    targetTrainName: trainName || ''
                });

                console.log('[Train Tracker Extension] Target saved to storage!');

                // Show confirmation toast
                showToast(`✓ Target set: Train #${trainNumber} - ${trainClass}`);
            } catch (e) {
                console.error('[Train Tracker Extension] Error saving:', e);
            }
        }
    });

    // Show a toast notification
    function showToast(message) {
        const existing = document.querySelector('#train-ext-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'train-ext-toast';
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; padding: 14px 20px;
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white; font-size: 14px; font-weight: 600;
            border-radius: 8px; z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            animation: slideUp 0.3s ease;
        `;
        toast.textContent = message;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

})();
