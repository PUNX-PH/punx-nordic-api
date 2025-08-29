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

// Utility to get today's UTC date in YYYY-MM-DD
function getUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://spinmo-panalomo.vercel.app"); // allow only your frontend
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Support Next.js/Vercel req.json() + Express req.body
    let data;
    if (typeof req.json === "function") {
      data = await req.json();
    } else {
      data = req.body;
    }

    const { PrizeId, Index } = data || {};

    if (!PrizeId) {
      return res.status(400).json({ error: "PrizeId is required" });
    }

    const utcDate = getUtcDateString();

    // Read prizes
    const prizes = await fetchJson("/Prizes.json");
    let result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN" };

    if (PrizeId !== "TRY_AGAIN" && typeof Index === "number" && prizes[Index]) {
      const sel = prizes[Index];
      if (sel.Remaining > 0) {
        const newRemaining = sel.Remaining - 1;
        // Decrement prize count
        await fetch(`${FIREBASE_URL}/Prizes/${Index}/Remaining.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRemaining),
        });
        result = { PrizeName: sel.PrizeName, PrizeId: sel.PrizeId };
      }
    }

    // GameStats by UTC date
    // Increment TotalSpins for today
    const spinsPath = `/GameStats/${utcDate}/TotalSpins.json`;
    let totalSpins = await fetchJson(spinsPath).catch(() => 0);
    totalSpins = (Number(totalSpins) || 0) + 1;
    await fetch(`${FIREBASE_URL}/GameStats/${utcDate}/TotalSpins.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(totalSpins),
    });

    // Increment win count for PrizeId (except Try Again)
    let winCount = 0;
    if (PrizeId !== "TRY_AGAIN") {
      const winPath = `/GameStats/${utcDate}/Prizes/${PrizeId}.json`;
      winCount = await fetchJson(winPath).catch(() => 0);
      winCount = (Number(winCount) || 0) + 1;
      await fetch(`${FIREBASE_URL}/GameStats/${utcDate}/Prizes/${PrizeId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(winCount),
      });
    }

    return res.status(200).json({
      success: true,
      result,
      stats: {
        utcDate,
        updatedPrize: PrizeId !== "TRY_AGAIN"
          ? { PrizeId, winCount }
          : undefined,
      },
    });
  } catch (err) {
    console.error("updatepanalo error:", err);
    return res.status(500).json({ error: err.message });
  }
};