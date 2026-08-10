# AiLSA Studio — 1:1 ViewMax.io Clone

Exact 1:1 copy of viewmax.io rebuilt as **AiLSA Studio**. Single-file, fully functional demo — wire your API keys to go production.

## Live file
`index.html` — open in preview or deploy to Vercel/Netlify/Cloudflare Pages.

## Features (identical to ViewMax.io)
- Hero “What will you create?” + carousel (YouTube Shorts / AI Kids / UGC / AI Ads)
- “Every AI tool you need, in one place.” tabs + 4 hero tools + 6 model cards
- Marketing Studio + 12-tool grid
- Full **AiLSA Studio Workspace** (left sidebar):
  - Text to Video (Kling 3.0 Turbo / Seedance 2.0 / Veo 3.1 / Sora 2)
  - Image to Video (Seedance 2.0 + Kling 3.0)
  - Text to Image (Nano Banana Pro / Flux 2 Pro / Seedream 4.5)
  - AI Chat Studio (Claude 4 + Gemini 2.5 + ChatGPT-5 + MCP `ailsa-generate-video`)
  - Scriptwriter, Voiceover & Lip Sync, Auto Captions, Marketing Ad Cloner
- Pricing (AiLSA Studio branding) + footer

## Branding
- All “VIEWMAX / ViewMax” → **AiLSA Studio**
- Logo: ▣ AiLSA Studio, title: AiLSA Studio, chat: AiLSA Chat, MCP: ailsa-generate-video

## Run
```
python3 -m http.server 8000 --bind 0.0.0.0
```

## Go Production
Replace mock `generateVideo()` / `generateImage()` in index.html with:
- Kling 3.0 Turbo → fal.ai / Replicate / Kuaishou API
- Seedance 2.0 → ByteDance Volcengine
- Veo 3.1 / Gemini → Google Vertex AI
- Claude → Anthropic + MCP SSE
- OpenAI → gpt-4o / gpt-image-1
- Voice → ElevenLabs, Captions → Whisper

See inline comment `// lib/generate.js — replace mock` in index.html.

## Deploy
Drag `index.html` to Vercel / Netlify. Add `/api/generate` for real keys.
