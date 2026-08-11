// =====================================================================
//  AiLSA Studio — Production model router (no mocks)
//  =====================================================================
//  Video models run ASYNC: this function submits the job and returns an
//  id; your client then polls `get-status.js` until the video is ready.
//  Images run SYNC and return a URL directly.
//
//  Providers: fal.ai (primary) · OpenAI (Sora 2) · Google (Veo/Nano opt)
//  Keys come from environment variables (see .env.example).
// =====================================================================

const SAMPLE_FALLBACK = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

// ---------- MODEL ROUTING TABLE ----------
// type: 'video' (async, returns id) or 'image' (sync, returns url)
// provider: which API to call. Check exact slugs at fal.ai/models (or replicate.com/models).
const MODELS = {
  // ---- VIDEO ----
  "Kling 3.0 Turbo (fastest)": {
    provider: "fal", type: "video",
    model: "fal-ai/kling-video/v3/standard/text-to-video", // Kling 3.0 standard. Pro = .../pro/text-to-video
  },
  "Kling 3.0 Turbo": {
    provider: "fal", type: "video",
    model: "fal-ai/kling-video/v3/standard/text-to-video",
  },
  "Seedance 2.0": {
    provider: "fal", type: "video",
    model: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
  },
  "Seedance 2.0 (image → video)": {
    provider: "fal", type: "video",
    model: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
  },
  "Veo 3.1": {
    provider: "fal", type: "video",
    model: "fal-ai/google/veo/v3.1/text-to-video", // verify slug on fal.ai/models
  },
  "Sora 2": {
    provider: "openai", type: "video",
    model: "sora-2-pro", // API runs until ~Sep 24 2026; verify current status
  },
  // ---- IMAGE ----
  "Nano Banana Pro": {
    provider: "fal", type: "image",
    model: "fal-ai/google/gemini-image", // "nano banana" image model on fal; verify slug
  },
  "Flux 2 Pro": {
    provider: "fal", type: "image",
    model: "fal-ai/flux-2-pro",
  },
  "Seedream 4.5": {
    provider: "fal", type: "image",
    model: "fal-ai/bytedance/seedream/4.5/standard", // verify slug
  },
};

const PROVIDER_KEYS = {
  fal: process.env.FAL_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  replicate: process.env.REPLICATE_API_TOKEN,
};

// ---------- HTTP helpers ----------
function ok(data) { return { statusCode: 200, body: JSON.stringify(data) }; }
function fail(msg, status = 500) { return { statusCode: status, body: JSON.stringify({ error: msg }) }; }

async function falSubmit(model, input) {
  // fal async queue — returns a request_id your client polls via get-status.js
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${PROVIDER_KEYS.fal}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fal error ${res.status}: ${JSON.stringify(json)}`);
  return { id: json.request_id, statusUrl: json.status_url, responseUrl: json.response_url };
}

async function falRun(model, input) {
  // fal sync endpoint — returns output directly (good for images)
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${PROVIDER_KEYS.fal}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fal error ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function openaiSubmit(model, prompt) {
  const res = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PROVIDER_KEYS.openai}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`openai error ${res.status}: ${JSON.stringify(json)}`);
  // OpenAI video returns an id that you poll at GET /v1/videos/{id}
  return { id: json.id, statusUrl: `https://api.openai.com/v1/videos/${json.id}` };
}

// ---------- main handler ----------
export async function handler(event) {
  if (event.httpMethod !== "POST") return fail("Method not allowed", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return fail("Invalid JSON body"); }

  const { model, prompt, aspectRatio } = body;
  const cfg = MODELS[model];

  if (!cfg) {
    return fail(`Unknown model "${model}". Supported: ${Object.keys(MODELS).join(", ")}`, 400);
  }
  if (!prompt) return fail("Missing prompt", 400);

  const key = PROVIDER_KEYS[cfg.provider];
  if (!key) {
    return fail(
      `Missing key for "${cfg.provider}" (${cfg.model}). Add ${cfg.provider === "fal" ? "FAL_KEY" :
        cfg.provider === "openai" ? "OPENAI_API_KEY" : "GOOGLE_API_KEY"} to Netlify env vars — see .env.example.`,
      400
    );
  }

  try {
    // ===== IMAGE MODELS (sync) =====
    if (cfg.type === "image") {
      const aspect = aspectRatio || "1:1";
      const [w, h] = aspect.split(":").map(Number);
      const out = await falRun(cfg.model, {
        prompt,
        image_size: { width: w, height: h },
      });
      // fal image output is usually { image: { url } } or { images: [{url}] }
      const url = out.image?.url || (Array.isArray(out.images) && out.images[0]?.url);
      if (!url) throw new Error("No image url in fal response");
      return ok({ url, real: true, engine: model, status: "succeeded" });
    }

    // ===== VIDEO MODELS (async — submit, return id to poll) =====
    const aspect = aspectRatio || "9:16";
    let id, statusUrl, responseUrl;

    if (cfg.provider === "fal") {
      const input = { prompt, aspect_ratio: aspect };
      if (cfg.model.includes("image-to-video")) {
        input.image_url = body.image_url; // optional start frame for image→video
      }
      ({ id, statusUrl, responseUrl } = await falSubmit(cfg.model, input));
    } else if (cfg.provider === "openai") {
      ({ id, statusUrl } = await openaiSubmit(cfg.model, prompt));
    } else {
      return fail(`Unsupported video provider: ${cfg.provider}`, 400);
    }

    // Return the id + polling endpoint. Client calls get-status.js?model=X&id=Y
    return ok({
      id,
      engine: model,
      provider: cfg.provider,
      status: "processing",
      pollUrl: `/.netlify/functions/get-status?model=${encodeURIComponent(model)}&id=${encodeURIComponent(id)}`,
      // safety: if anything goes wrong, client can fall back to this
      fallbackUrl: SAMPLE_FALLBACK,
      message: "Video is generating. Poll the pollUrl until status is 'succeeded'.",
    });
  } catch (e) {
    console.error("generate error:", e);
    return ok({
      status: "error",
      error: e.message,
      fallbackUrl: SAMPLE_FALLBACK,
      message: "Generation failed — showing sample video.",
    });
  }
}
