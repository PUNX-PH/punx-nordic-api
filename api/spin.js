// Spin.js -- Enhanced Prize Picker: Supports Probability or Inventory-based randomness

const FIREBASE_URL =
  process.env.FIREBASE_URL || "https://spin-panalo-default-rtdb.firebaseio.com";

// Helper to safely convert to number (with fallback)
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Fetch JSON from Firebase Realtime DB
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

// Fetch /Settings.json with fallback
async function fetchSettings() {
  try {
    const settings = await fetchJson("/Settings.json");
    return settings || {};
  } catch {
    return {};
  }
}

// Inventory-based picker: chance gets lower as inventory is depleted
function pickPrizeByInventory(prizes, tryAgainWeight = 40) {
  const weights = prizes.map((p) => {
    if (!p || p.Remaining <= 0) return 0;
    const ratio = p.Remaining / Math.max(1, p.Quantity);
    const base = Math.max(0.05, ratio) * 100;
    return base * (0.85 + Math.random() * 0.3); // jitter
  });
  // Add "Try Again" at end
  weights.push(tryAgainWeight * (0.9 + Math.random() * 0.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1; // "Try Again" fallback
}

// Probability-based picker: uses Probability for each prize, 0 if depleted
function pickPrizeByProbability(prizes, tryAgainWeight = 40) {
  const weights = prizes.map((p) =>
    (p && p.Remaining > 0) ? safeNum(p.Probability, 0) : 0
  );
  // Add "Try Again"
  weights.push(tryAgainWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1; // "Try Again"
}

// Main exported endpoint: Vercel/Next.js API format
module.exports = async (req, res) => {
  // ✅ Allow multiple origins
  const allowedOrigins = [
    "https://spinmo-panalomo.vercel.app",
    "https://punx-ph.github.io"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Handle preflight requests (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Fetch prizes and settings
    const [prizes, settings] = await Promise.all([
      fetchJson("/Prizes.json"),
      fetchSettings(),
    ]);
    if (!Array.isArray(prizes)) throw new Error("Prizes is not an array");

    const useProbability = !!settings.useProbability;
    const tryAgainWeight = safeNum(process.env.TRY_AGAIN_WEIGHT, 40);

    let pickedIndex;
    if (useProbability) {
      pickedIndex = pickPrizeByProbability(prizes, tryAgainWeight);
    } else {
      pickedIndex = pickPrizeByInventory(prizes, tryAgainWeight);
    }

    let result;
    if (pickedIndex === prizes.length) {
      // "Try Again" (last index)
      result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN", Index: -1 };
    } else {
      const sel = prizes[pickedIndex];
      result = { PrizeName: sel.PrizeName, PrizeId: sel.PrizeId, Index: pickedIndex };
    }

    // Attach current UTC date as ISO string
    result.utcDate = new Date().toISOString().slice(0, 10);

    return res.status(200).json({
      success: true,
      result,
      algorithm: useProbability ? "probability" : "inventory",
    });
  } catch (err) {
    console.error("spinpanalo error:", err);
    return res.status(500).json({ error: err.message });
  }
};
