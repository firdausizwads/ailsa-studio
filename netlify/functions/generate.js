// =====================================================================
//  AiLSA Studio — Production model router (no mocks)
//  =====================================================================
//  Video models run ASYNC: this function submits the job and returns an
//  id; your client then polls `get-status.js` until the video is ready.
//  Images run SYNC and return a URL directly.
//  Providers: fal.ai (primary) · OpenAI (Sora 2)
//  Keys come from environment variables (FAL_KEY, OPENAI_API_KEY).
// =====================================================================

const SAMPLE_FALLBACK = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

// ---------- MODEL ROUTING TABLE ----------
const MODELS = {
  // ---- VIDEO ----
  "Kling 3.0 Turbo (fastest)": {
    provider: "fal", type: "video",
    model: "fal-ai/kling-video/v3/standard/text-to-video",
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
    model: "fal-ai/google/veo/v3.1/text-to-video",
  },
  "Sora 2": {
    provider: "openai", type: "video",
    model: "sora-2-pro",
  },
  // ---- IMAGE ----
  "Nano Banana Pro": {
    provider: "fal", type: "image",
    model: "fal-ai/google/gemini-image",
  },
  "Flux 2 Pro": {
    provider: "fal", type: "image",
    model: "fal-ai/flux-2-pro",
  },
  "Seedream 4.5": {
    provider: "fal", type: "image",
    model: "fal-ai/bytedance/seedream/4.5/standard",
  },
};

const PROVIDER_KEYS = {
  fal: process.env.FAL_KEY,
  openai: process.env.OPENAI_API_KEY,
};

function ok(data) { return { statusCode: 200, body: JSON.stringify(data) }; }
function fail(msg, status = 500) { return { statusCode: status, body: JSON.stringify({ error: msg }) }; }

async function falSubmit(model, input) {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { "Authorization": `Key ${PROVIDER_KEYS.fal}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fal error ${res.status}: ${JSON.stringify(json)}`);
  return { id: json.request_id, statusUrl: json.status_url, responseUrl: json.response_url };
}

async function falRun(model, input) {
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { "Authorization": `Key ${PROVIDER_KEYS.fal}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fal error ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return fail("Method not allowed", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return fail("Invalid JSON body"); }

  const { model, prompt, aspectRatio } = body;
  const cfg = MODELS[model];

  if (!cfg) return fail(`Unknown model "${model}". Supported: ${Object.keys(MODELS).join(", ")}`, 400);
  if (!prompt) return fail("Missing prompt", 400);

  const key = PROVIDER_KEYS[cfg.provider];
  if (!key) return fail(`Missing ${cfg.provider === "fal" ? "FAL_KEY" : "OPENAI_API_KEY"} in Netlify env vars.`, 400);

  try {
    if (cfg.type === "image") {
      const aspect = aspectRatio || "1:1";
      const [w, h] = aspect.split(":").map(Number);
      const out = await falRun(cfg.model, { prompt, image_size: { width: w, height: h } });
      const url = out.image?.url || (Array.isArray(out.images) && out.images[0]?.url);
      if (!url) throw new Error("No image url in fal response");
      return ok({ url, real: true, engine: model, status: "succeeded" });
    }

    const aspect = aspectRatio || "9:16";
    let id, responseUrl;

    if (cfg.provider === "fal") {
      const input = { prompt, aspect_ratio: aspect };
      if (cfg.model.includes("image-to-video")) input.image_url = body.image_url;
      ({ id, responseUrl } = await falSubmit(cfg.model, input));
    } else if (cfg.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/videos", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, prompt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`openai error ${res.status}: ${JSON.stringify(json)}`);
      id = json.id;
    } else {
      return fail(`Unsupported video provider: ${cfg.provider}`, 400);
    }

    return ok({
      id,
      engine: model,
      provider: cfg.provider,
      status: "processing",
      pollUrl: `/.netlify/functions/get-status?model=${encodeURIComponent(model)}&id=${encodeURIComponent(id)}`,
      fallbackUrl: SAMPLE_FALLBACK,
      message: "Video is generating. Poll pollUrl until status is 'succeeded'.",
    });
  } catch (e) {
    console.error("generate error:", e);
    return ok({ status: "error", error: e.message, fallbackUrl: SAMPLE_FALLBACK, message: "Generation failed — showing sample." });
  }
}
