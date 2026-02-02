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
                    url: "https://train-ticket-notifier.vercel.app/",
                });
            };
            statusEl.appendChild(msg);
            statusEl.appendChild(btn);
            return;
        }

        // Get token from extension storage first (Synchronous relative to injection)
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

        // Inject and Reload in one go
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

                // Redirect or reload
                if (window.location.pathname === "/login" || window.location.pathname === "/login-advanced") {
                    window.location.href = "/";
                } else if (window.location.pathname === "/") {
                    window.location.reload();
                }
            },
        });

        statusEl.textContent = "Account synced successfully!";
    } catch (err) {
        statusEl.textContent = "Sync failed.";
        console.error(err);
    }
});
