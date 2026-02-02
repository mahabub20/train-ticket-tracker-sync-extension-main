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
            url: "*://YOUR_VERCEL_APP_URL/*",
        });

        if (!trackerTab) {
            statusEl.textContent = "";
            const msg = document.createElement("span");
            msg.textContent = "Open the tracker site. ";
            const btn = document.createElement("button");
            btn.textContent = "Visit tracker";
            btn.onclick = () => {
                chrome.tabs.create({
                    url: "https://YOUR_VERCEL_APP_URL/",
                });
            };
            statusEl.appendChild(msg);
            statusEl.appendChild(btn);
            return;
        }

        await chrome.scripting.executeScript({
            target: { tabId: trackerTab.id },
            func: () => {
                chrome.storage.local.get([
                    "bdTrainToken",
                    "bdTrainSSDK",
                    "bdTrainUUDID",
                ], (result) => {
                    const token = result.bdTrainToken;
                    const ssdk = result.bdTrainSSDK;
                    const uudid = result.bdTrainUUDID;

                    if (token) {
                        // Set values in the page's localStorage
                        try {
                            localStorage.setItem("token", token);
                            if (ssdk) localStorage.setItem("ssdk", ssdk);
                            if (uudid) localStorage.setItem("uudid", uudid);
                        } catch (e) {
                            // ignore quota or access errors
                        }
                    } else {
                        chrome.runtime.sendMessage({ type: "NO_TOKEN_FOUND" });
                    }
                });
            },
        });

        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === "NO_TOKEN_FOUND") {
                statusEl.textContent = "Sync failed, log in to eticket first.";
            }
        });

        statusEl.textContent = "Account synced successfully!";

        // Redirect or reload to homepage
        chrome.scripting.executeScript({
            target: { tabId: trackerTab.id },
            func: () => {
                if (window.location.pathname === "/login" || window.location.pathname === "/login-advanced") {
                    window.location.href = "/";
                } else if (window.location.pathname === "/") {
                    window.location.reload();
                }
            },
        });
    } catch (err) {
        statusEl.textContent = "Sync failed.";
    }
});
