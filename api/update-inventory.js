const FIREBASE_URL =
  process.env.FIREBASE_URL || "https://spin-panalo-default-rtdb.firebaseio.com";

async function fetchJson(path, opts) {
  const resp = await fetch(`${FIREBASE_URL}${path}`, opts);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Firebase ${resp.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { PrizeId, Index } = await req.json?.() || req.body || {};

    if (!PrizeId) {
      return res.status(400).json({ error: "PrizeId is required" });
    }

    // Read prizes
    const prizes = await fetchJson("/Prizes.json");

    let result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN" };

    if (PrizeId !== "TRY_AGAIN" && typeof Index === "number" && prizes[Index]) {
      const sel = prizes[Index];
      if (sel.Remaining > 0) {
        const newRemaining = sel.Remaining - 1;
        await fetch(`${FIREBASE_URL}/Prizes/${Index}/Remaining.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRemaining),
        });
        result = { PrizeName: sel.PrizeName, PrizeId: sel.PrizeId };
      }
    }

    // Update spins
    let totalSpins = await fetchJson("/GameStats/TotalSpins.json").catch(() => 0);
    totalSpins = (Number(totalSpins) || 0) + 1;
    await fetch(`${FIREBASE_URL}/GameStats/TotalSpins.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(totalSpins),
    });

    return res.status(200).json({ success: true, result, stats: { totalSpins } });
  } catch (err) {
    console.error("updatepanalo error:", err);
    return res.status(500).json({ error: err.message });
  }
};
