// Train Ticket Tracker Sync - Popup JS

// Load saved target on popup open
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['targetTrainNumber', 'targetTrainClass']);
    if (result.targetTrainNumber) {
        document.getElementById('trainNumber').value = result.targetTrainNumber;
    }
    if (result.targetTrainClass) {
        document.getElementById('trainClass').value = result.targetTrainClass;
    }

    // Show current target
    updateTargetStatus(result.targetTrainNumber, result.targetTrainClass);
});

function updateTargetStatus(trainNum, trainClass) {
    const statusEl = document.getElementById('targetStatus');
    if (trainNum || trainClass) {
        statusEl.textContent = `Current: Train #${trainNum || 'Any'} - ${trainClass || 'Any class'}`;
        statusEl.style.color = '#0f0';
    } else {
        statusEl.textContent = 'No target set (will select first available)';
        statusEl.style.color = '#ff0';
    }
}

// Save target button
document.getElementById('saveTargetBtn').addEventListener('click', async () => {
    const trainNumber = document.getElementById('trainNumber').value.trim();
    const trainClass = document.getElementById('trainClass').value;

    await chrome.storage.local.set({
        targetTrainNumber: trainNumber,
        targetTrainClass: trainClass
    });

    updateTargetStatus(trainNumber, trainClass);

    const statusEl = document.getElementById('targetStatus');
    statusEl.textContent = '✓ Target saved!';
    statusEl.style.color = '#0f0';

    setTimeout(() => updateTargetStatus(trainNumber, trainClass), 2000);
});

// Open Tracker App button
document.getElementById("openAppBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://train-ticket-notifier.vercel.app/login" });
});

// Sync Account button
document.getElementById("syncBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("status");
    statusEl.textContent = "Syncing...";

    try {
        // STEP 1: Grab token from eticket
        const [eticketTab] = await chrome.tabs.query({
            url: "*://eticket.railway.gov.bd/*",
        });

        if (!eticketTab) {
            statusEl.textContent = "";
            const msg = document.createElement("span");
            msg.textContent = "Open eticket first. ";
            const btn = document.createElement("button");
            btn.textContent = "Visit eticket";
            btn.onclick = () => {
                chrome.tabs.create({ url: "https://eticket.railway.gov.bd/" });
            };
            statusEl.appendChild(msg);
            statusEl.appendChild(btn);
            return;
        }

        await chrome.scripting.executeScript({
            target: { tabId: eticketTab.id },
            files: ["sync.js"],
        });

        statusEl.textContent = "Token copied. Now injecting...";

        // STEP 2: Inject token into tracker app
        const [trackerTab] = await chrome.tabs.query({
            url: "*://train-ticket-notifier.vercel.app/*",
        });

        if (!trackerTab) {
            statusEl.textContent = "";
            const msg = document.createElement("span");
            msg.textContent = "Open the tracker site. ";
            const btn = document.createElement("button");
            btn.textContent = "Visit tracker";
            btn.onclick = () => {
                chrome.tabs.create({
                    url: "https://train-ticket-notifier.vercel.app/login",
                });
            };
            statusEl.appendChild(msg);
            statusEl.appendChild(btn);
            return;
        }

        // Get token from extension storage
        const result = await chrome.storage.local.get([
            "bdTrainToken",
            "bdTrainSSDK",
            "bdTrainUUDID",
        ]);

        const token = result.bdTrainToken;
        const ssdk = result.bdTrainSSDK;
        const uudid = result.bdTrainUUDID;

        if (!token) {
            statusEl.textContent = "Sync failed, log in to eticket first.";
            return;
        }

        // Inject and Reload
        await chrome.scripting.executeScript({
            target: { tabId: trackerTab.id },
            args: [token, ssdk, uudid],
            func: (token, ssdk, uudid) => {
                try {
                    localStorage.setItem("token", token);
                    if (ssdk) localStorage.setItem("ssdk", ssdk);
                    if (uudid) localStorage.setItem("uudid", uudid);
                } catch (e) {
                    // ignore
                }
            },
        });

        // Force reload
        await chrome.tabs.reload(trackerTab.id, { bypassCache: true });

        statusEl.textContent = "Account synced successfully!";
    } catch (err) {
        statusEl.textContent = "Sync failed.";
        console.error(err);
    }
});
