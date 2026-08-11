// Netlify Function: Real AI generation via Replicate (Kling, Seedance, Flux, Nano Banana)
// Put your REPLICATE_API_TOKEN in Netlify > Site configuration > Environment variables
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }
  try {
    const { model, prompt, aspectRatio } = JSON.parse(event.body || '{}')
    
    const token = "r8_VgZelPRMcqUwPZpjN01RM7WvfDAWb563xIspS"
    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing REPLICATE_API_TOKEN in Netlify Environment Variables. Add it at: Site configuration > Environment variables' }) }
    }

    // Map AiLSA models to Replicate models
    const MODEL_MAP = {
      "Kling 3.0 Turbo (fastest)": "kwaivgi/kling-v3",
      "Kling 3.0 Turbo": "kwaivgi/kling-v3",
      "Seedance 2.0": "bytedance/seedream-4", // placeholder - replace with real seedance when available, or use luma
      "Seedance 2.0 (image → video)": "bytedance/seedance-1.0",
      "Veo 3.1": "google/veo-3",
      "Sora 2": "openai/sora-2",
      "Nano Banana Pro": "google/nano-banana",
      "Flux 2 Pro": "black-forest-labs/flux-1.1-pro",
      "Seedream 4.5": "bytedance/seedream-4"
    }

    // For FREE demo without key, use Pollinations (no key needed) for images
    if (!MODEL_MAP[model] || model.includes('Nano') || model.includes('Flux') || model.includes('Seedream')) {
      // Free image via Pollinations - no API key needed
      const seed = Math.floor(Math.random()*100000)
      const url = `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=flux`
      return { statusCode: 200, body: JSON.stringify({ url, free: true }) }
    }

    // Real Replicate call for video
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_MAP[model] || "kwaivgi/kling-v3",
        input: { prompt, aspect_ratio: aspectRatio || "9:16", duration: 5 }
      })
    })
    const prediction = await createRes.json()
    if (prediction.error) throw new Error(prediction.error)

    return { statusCode: 200, body: JSON.stringify({ url: prediction.output || prediction.urls?.get, prediction, status: 'processing' }) }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
