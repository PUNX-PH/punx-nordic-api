const FIREBASE_URL =
  process.env.FIREBASE_URL || "https://spin-panalo-default-rtdb.firebaseio.com";

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchJson(path) {
  const resp = await fetch(`${FIREBASE_URL}${path}`);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Firebase ${resp.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pickPrizeIndex(prizes, tryAgainWeight = 40) {
  const weights = prizes.map((p) => {
    if (!p || p.Remaining <= 0) return 0;
    const ratio = p.Remaining / Math.max(1, p.Quantity);
    const base = Math.max(0.05, ratio) * 100;
    return base * (0.85 + Math.random() * 0.3); // jitter
  });

  weights.push(tryAgainWeight * (0.9 + Math.random() * 0.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const prizes = await fetchJson("/Prizes.json");
    if (!Array.isArray(prizes)) throw new Error("Prizes is not an array");

    const tryAgainWeight = safeNum(process.env.TRY_AGAIN_WEIGHT, 40);
    const pickedIndex = pickPrizeIndex(prizes, tryAgainWeight);

    let result;
    if (pickedIndex === prizes.length) {
      result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN", Index: -1 };
    } else {
      const sel = prizes[pickedIndex];
      result = { PrizeName: sel.PrizeName, PrizeId: sel.PrizeId, Index: pickedIndex };
    }

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("spinpanalo error:", err);
    return res.status(500).json({ error: err.message });
  }
};
