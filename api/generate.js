/**
 * Bandmate AI - Vercel Serverless Function
 * Natural language -> structured musical arrangement.
 * GROQ_API_KEY is read only on the server.
 */

const ALLOWED_ORIGINS = [
  "https://band-ai-synthetizer.vercel.app"
];

const INSTRUMENTS = ["piano", "bass", "drums", "sitar", "synth"];
const KEYS = [
  "C Major",
  "G Major",
  "D Minor",
  "A Minor",
  "Raga Yaman",
  "Pentatonic"
];

const MUSIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tempo: {
      type: "integer",
      minimum: 60,
      maximum: 180
    },
    key: {
      type: "string",
      enum: KEYS
    },
    mood: {
      type: "string",
      enum: [
        "calm",
        "energetic",
        "dark",
        "cinematic",
        "happy",
        "melancholic",
        "mysterious",
        "ambient",
        "aggressive",
        "meditative"
      ]
    },
    arrangement: {
      type: "string",
      enum: ["minimal", "groove", "full_band", "cinematic", "ambient"]
    },
    instruments: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            enum: INSTRUMENTS
          },
          volume: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          pattern: {
            type: "array",
            minItems: 8,
            maxItems: 8,
            items: {
              type: "integer",
              minimum: -1,
              maximum: 11
            }
          }
        },
        required: ["name", "volume", "pattern"]
      }
    },
    description: {
      type: "string"
    }
  },
  required: ["tempo", "key", "mood", "arrangement", "instruments", "description"]
};

function setCors(res, origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin || "");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY não configurada no ambiente do Vercel."
    });
  }

  const prompt = typeof req.body?.prompt === "string"
    ? req.body.prompt.trim()
    : "";

  if (!prompt) {
    return res.status(400).json({ error: "Informe um prompt musical." });
  }

  if (prompt.length > 2000) {
    return res.status(400).json({
      error: "O prompt deve possuir no máximo 2000 caracteres."
    });
  }

  const systemPrompt = `Você é o Bandmate AI Music Director, um motor de direção musical.
Sua função é transformar linguagem natural em uma pequena configuração musical executável pelo motor Web Audio do Bandmate AI.

Instrumentos disponíveis: piano, bass, drums, sitar, synth.
Tonalidades disponíveis: C Major, G Major, D Minor, A Minor, Raga Yaman, Pentatonic.
BPM permitido: 60 a 180.

Regras de pattern:
- Cada pattern deve possuir exatamente 8 posições.
- -1 significa silêncio.
- Para piano, bass, sitar e synth use valores de 0 a 11 representando graus/intervalos dentro da escala.
- Para drums: 0 = kick, 1 = snare, 2 = hi-hat e -1 = silêncio.
- Crie padrões musicalmente coerentes, simples e repetíveis em loop.
- O volume deve ficar entre 0 e 100.
- Use somente instrumentos solicitados ou claramente adequados ao estilo descrito.
- Não invente instrumentos.
- Priorize uma combinação tocável e harmoniosa.
- A descrição deve explicar brevemente a decisão musical.

O resultado será consumido diretamente por JavaScript. Não inclua markdown.`;

  try {
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_completion_tokens: 1400,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "bandmate_music_arrangement",
              strict: true,
              schema: MUSIC_SCHEMA
            }
          }
        })
      }
    );

    const payload = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq API error:", payload);
      return res.status(groqResponse.status >= 500 ? 502 : groqResponse.status).json({
        error: "Falha ao consultar a Groq API.",
        details: payload?.error?.message || "Erro desconhecido."
      });
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: "A Groq API não retornou uma composição válida."
      });
    }

    const music = JSON.parse(content);

    return res.status(200).json({
      success: true,
      music,
      model: payload.model || "openai/gpt-oss-20b"
    });
  } catch (error) {
    console.error("Bandmate API error:", error);

    return res.status(500).json({
      error: "Erro interno ao gerar a composição.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}
