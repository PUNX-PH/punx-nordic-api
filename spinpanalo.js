// File: api/spin.js
import fetch from "node-fetch";

const FIREBASE_URL = "https://spin-panalo-default-rtdb.firebaseio.com";

// Helper: Get current prizes
async function getPrizes() {
  const res = await fetch(`${FIREBASE_URL}/Prizes.json`);
  return res.json();
}

// Helper: Update prize + stats
async function updateFirebase(prizes, totalSpins) {
  await fetch(`${FIREBASE_URL}/Prizes.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prizes),
  });

  await fetch(`${FIREBASE_URL}/GameStats/TotalSpins.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(totalSpins),
  });
}

// Weighted random selection
function pickPrize(prizes) {
  let weights = [];

  prizes.forEach((prize) => {
    // Base weight: proportional to remaining stock
    let weight = prize.Remaining / prize.Quantity;

    // Extra bias to make it more natural
    weight *= 100;

    // If inventory is empty, weight = 0
    if (prize.Remaining <= 0) weight = 0;

    weights.push(weight);
  });

  // Add "Try Again" weight
  weights.push(50); // <- Adjust difficulty here

  // Build cumulative distribution
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    if (rnd < weights[i]) return i;
    rnd -= weights[i];
  }

  return weights.length - 1; // fallback "Try Again"
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const prizes = await getPrizes();
    const statsRes = await fetch(`${FIREBASE_URL}/GameStats/TotalSpins.json`);
    let totalSpins = await statsRes.json();

    const index = pickPrize(prizes);

    let result;
    if (index === prizes.length) {
      result = { PrizeName: "Try Again", PrizeId: "TRY_AGAIN" };
    } else {
      let selectedPrize = prizes[index];

      if (selectedPrize.Remaining > 0) {
        selectedPrize.Remaining -= 1;
      }

      result = {
        PrizeName: selectedPrize.PrizeName,
        PrizeId: selectedPrize.PrizeId,
      };
    }

    totalSpins += 1;

    // Save changes back to Firebase
    await updateFirebase(prizes, totalSpins);

    return res.status(200).json({
      success: true,
      result,
      stats: { totalSpins },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
