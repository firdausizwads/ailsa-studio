// =====================================================================
//  AiLSA Studio — get-status.js  (poll this from your client)
//  =====================================================================
//  After generate.js submits a video job, the client polls this function:
//    GET /.netlify/functions/get-status?model=<model>&id=<id>
//  It returns status "succeeded" with a real video URL when ready.
// =====================================================================

const PROVIDER_KEYS = {
  fal: process.env.FAL_KEY,
  openai: process.env.OPENAI_API_KEY,
};

const MODELS = {
  "Kling 3.0 Turbo (fastest)": { provider: "fal", model: "fal-ai/kling-video/v3/standard/text-to-video" },
  "Kling 3.0 Turbo": { provider: "fal", model: "fal-ai/kling-video/v3/standard/text-to-video" },
  "Seedance 2.0": { provider: "fal", model: "fal-ai/bytedance/seedance/v1/pro/text-to-video" },
  "Seedance 2.0 (image → video)": { provider: "fal", model: "fal-ai/bytedance/seedance/v1/pro/image-to-video" },
  "Veo 3.1": { provider: "fal", model: "fal-ai/google/veo/v3.1/text-to-video" },
  "Sora 2": { provider: "openai", model: "sora-2-pro" },
};

function ok(data) { return { statusCode: 200, body: JSON.stringify(data) }; }
function fail(msg, status = 500) { return { statusCode: status, body: JSON.stringify({ error: msg }) }; }

export async function handler(event) {
  const q = event.queryStringParameters || {};
  const { model, id } = q;
  const cfg = MODELS[model];
  if (!cfg || !id) return fail("Missing model or id", 400);

  try {
    if (cfg.provider === "fal") {
      const res = await fetch(`https://queue.fal.run/${cfg.model}/requests/${id}`, {
        headers: { Authorization: `Key ${PROVIDER_KEYS.fal}` },
      });
      if (res.status === 404) return ok({ status: "processing", engine: model });
      const data = await res.json().catch(() => ({}));
      if (data.status === "COMPLETED" || data.video?.url) {
        return ok({ status: "succeeded", engine: model, url: data.video?.url || data.url });
      }
      if (data.status === "FAILED" || data.error) {
        return ok({ status: "failed", engine: model, error: data.error?.message || data.error });
      }
      return ok({ status: "processing", engine: model });
    }

    if (cfg.provider === "openai") {
      const res = await fetch(`https://api.openai.com/v1/videos/${id}`, {
        headers: { Authorization: `Bearer ${PROVIDER_KEYS.openai}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "completed" || data.output?.[0]) {
        return ok({ status: "succeeded", engine: model, url: data.output?.[0]?.url });
      }
      if (data.status === "failed") return ok({ status: "failed", engine: model, error: data.error?.message });
      return ok({ status: "processing", engine: model });
    }

    return fail(`Unknown provider ${cfg.provider}`, 400);
  } catch (e) {
    console.error("get-status error:", e);
    return fail(e.message);
  }
}
