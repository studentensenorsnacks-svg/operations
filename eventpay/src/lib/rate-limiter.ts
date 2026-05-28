// Sliding-window rate limiter voor de EventPay API.
// EventPay laat maximaal 40 verzoeken per 10 seconden per API-key toe.
// We houden de timestamps van recente verzoeken bij. Als er al 40 verzoeken
// in het venster zitten, wacht een nieuw verzoek tot het oudste verloopt.
//
// Singleton op moduleniveau, gedeeld door alle API-routes binnen dit
// Next.js proces (één serverless instance / één lokaal dev-proces).

const WINDOW_MS = 10_000;
const MAX_REQUESTS = 40;

const timestamps: number[] = [];
let queue: Promise<void> = Promise.resolve();

function purge(now: number) {
  const cutoff = now - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
}

async function acquireOnce(): Promise<void> {
  const now = Date.now();
  purge(now);
  if (timestamps.length < MAX_REQUESTS) {
    timestamps.push(now);
    return;
  }
  const oldest = timestamps[0];
  const waitMs = Math.max(0, oldest + WINDOW_MS - now) + 25;
  await new Promise((r) => setTimeout(r, waitMs));
  return acquireOnce();
}

// Reserveer een slot. Wacht zo nodig tot het rate-limit-venster ruimte heeft.
// Verzoeken worden serieel afgehandeld zodat parallelle calls niet door het
// 40-plafond breken.
export async function acquireSlot(): Promise<void> {
  const release = queue;
  let resolveNext: () => void;
  queue = new Promise<void>((r) => {
    resolveNext = r;
  });
  await release;
  try {
    await acquireOnce();
  } finally {
    resolveNext!();
  }
}

// Voor /api/eventpay/_status — informatief, niet voor logica.
export function rateLimitSnapshot() {
  const now = Date.now();
  purge(now);
  return {
    used: timestamps.length,
    max: MAX_REQUESTS,
    window_ms: WINDOW_MS,
    next_slot_in_ms:
      timestamps.length < MAX_REQUESTS
        ? 0
        : Math.max(0, timestamps[0] + WINDOW_MS - now),
  };
}
