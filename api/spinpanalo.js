// File: api/spinpanalo.js
const FIREBASE_URL =
  process.env.FIREBASE_URL || "https://spin-panalo-default-rtdb.firebaseio.com";

// Helper to safely convert to number
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Helper to fetch from Firebase with error handling
async function fetchJson(path, opts) {
  const url = `${FIREBASE_URL}${path}`;
  const resp = await fetch(url, opts);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Firebase ${resp.status} ${resp.statusText}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Weighted random selection
function pickPrizeIndex(prizes, tryAgainWeight = 40) {
  const weights = prizes.map((p) => {
    if (!p || typeof p.Remaining !== "number" || typeof p.Quantity !== "number")
      return 0;
    if (p.Remaining <= 0) return 0;

    const ratio = p.Remaining / Math.max(1, p.Quantity); // remaining % of stock
    const base = Math.max(0.05, ratio) * 100;

    // add some jitter (0.85x – 1.15x) to make it feel natural
    return base * (0.85 + Math.random() * 0.3);
  });

  // Add "Try Again" weight
  weights.push(tryAgainWeight * (0.9 + Math.random() * 0.2));

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1; // fallback to "Try Again"
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Read prizes
    const prizes = await fetchJson("/Prizes.json");
    if (!Array.isArray(prizes)) {
      throw new Error("Prizes path did not return an array");
    }

    // 2. Read spins
    const totalSpinsRaw = await fetchJson("/GameStats/TotalSpins.json").catch(
      () => 0
    );
    let totalSpins = safeNum(totalSpinsRaw, 0);

    // 3. Pick prize
    const tryAgainWeight = safeNum(process.env.TRY_AGAIN_WEIGHT, 40);
    const pickedIndex = pickPrizeIndex(prizes, tryAgainWeight);

    let result;
    if (pickedIndex === prizes.length) {
      // "Try Again"
      result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN" };
    } else {
      const sel = prizes[pickedIndex];
      if (sel && sel.Remaining > 0) {
        const newRemaining = sel.Remaining - 1;

        // Update just the Remaining field
        await fetch(`${FIREBASE_URL}/Prizes/${pickedIndex}/Remaining.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRemaining),
        });

        result = { PrizeName: sel.PrizeName, PrizeId: sel.PrizeId };
      } else {
        result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN" };
      }
    }

    // 4. Update total spins
    totalSpins += 1;
    await fetch(`${FIREBASE_URL}/GameStats/TotalSpins.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(totalSpins),
    });

    // 5. Respond
    return res
      .status(200)
      .json({ success: true, result, stats: { totalSpins } });
  } catch (err) {
    console.error("spinpanalo error:", err);
    return res.status(500).json({ error: err.message });
  }
};
