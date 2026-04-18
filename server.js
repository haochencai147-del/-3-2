const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config({ override: true });

// Express app setup and runtime configuration.
const app = express();
const port = Number(process.env.PORT || 8787);
const rewriteModel = process.env.REWRITE_MODEL || "gpt-4.1-mini";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("Missing OPENAI_API_KEY in .env file.");
}

const openai = new OpenAI({ apiKey });

// The Responses API can return text in different shapes; this helper normalizes it to one string.
function extractResponsesText(response) {
  const directText = typeof response?.output_text === "string" ? response.output_text.trim() : "";
  if (directText) {
    return directText;
  }

  for (const item of response?.output || []) {
    for (const contentPart of item.content || []) {
      if (contentPart.type === "output_text" && contentPart.text) {
        return String(contentPart.text).trim();
      }
    }
  }

  return "";
}

function buildPromptA(userInput) {
  return `Prompt A: First call, generate Step 1 + Skeleton
You are a preprocessing module for a Statistical Averaging Engine.

Task:
Given the user's text, do two things:

1. Generate Step 1 - Correction
- Correct grammar, punctuation, spelling, and broken syntax.
- Preserve the original meaning, tone, and subjective presence.
- Do not beautify the language.
- Do not flatten it too much.

2. Extract a Concept Skeleton from the corrected text.
The Concept Skeleton must capture conceptual content, not poetic wording.

Return valid JSON only in this format:

{
  "step1": "string",
  "skeleton": {
    "core_states": ["..."],
    "relations": ["..."],
    "core_events": ["..."],
    "symbols_to_abstract": ["..."],
    "scene_details_to_remove": ["..."],
    "one_sentence_summary": "..."
  }
}

Rules for the skeleton:
- core_states = abstract emotional or conceptual states
- relations = speaker/addressee or person-to-person structure
- core_events = what is happening in plain conceptual language
- symbols_to_abstract = image-bearing words or objects that should not survive into Step 3
- scene_details_to_remove = concrete scenic details that should be reduced later
- one_sentence_summary = one flat conceptual summary in plain English

Do not explain anything.
Return JSON only.

User text:
${userInput}`;
}

// Prompt B/C/D progressively remove personal and image-heavy language.
function buildPromptB(step1, skeleton) {
  return `Prompt B: Second call, generate Step 2
You are generating Step 2 - Optimization for a Statistical Averaging Engine.

Input:
Step 1 text:
${step1}

Concept Skeleton:
${JSON.stringify(skeleton, null, 2)}

Task:
Rewrite the Step 1 text into clearer, smoother, more neutral, less individual language.

Rules:
- Preserve the conceptual meaning.
- Reduce vivid imagery and emotional intensity.
- Convert many symbolic phrases into explicit emotional, relational, or conceptual statements.
- Sound socially legible and polished, but not yet fully impersonal.
- Do not sound poetic, lyrical, elegant, or clever.
- Do not preserve symbolic objects unless they are necessary.
- Use the Concept Skeleton as the source of meaning.
- Begin flattening the language, but do not make it fully report-like yet.

Output only the Step 2 text.`;
}

function buildPromptC(step2, skeleton) {
  return `Prompt C: Third call, generate Step 3
You are generating Step 3 - Standardization Complete for a Statistical Averaging Engine.

Input:
Step 2 text:
${step2}

Concept Skeleton:
${JSON.stringify(skeleton, null, 2)}

Task:
Rewrite the content into maximally generic, context-neutral, impersonal language.

Rules:
- Use the Concept Skeleton as the main source of meaning.
- Preserve conceptual content, not poetic wording.
- Do not preserve symbolic objects, poetic scenery, or image-bearing nouns from the source.
- Do not retain unexplained visual scenes.
- Convert the text into neutral summary, analytical paraphrase, institutional language, generalized observation, or case-note language.
- Prefer abstract nouns such as:
  condition, context, experience, response, state, process, pattern, outcome, relation, recognition, exclusion, identity, distress, attachment, uncertainty, silence, mortality, memory, perception
- If the output still creates a clear visual scene, flatten it further.
- If any symbolic noun remains, replace it with a conceptual reference.

Output only the Step 3 text.`;
}

function buildPromptD(step3, skeleton) {
  return `Prompt D: Post-check flattening pass
You are performing one additional anti-poetic flattening pass for a Statistical Averaging Engine.

Input Step 3 text:
${step3}

Concept Skeleton:
${JSON.stringify(skeleton, null, 2)}

Task:
Rewrite the text to remove any remaining visual scene, symbolic object, lyrical rhythm, or poetic image.
Preserve conceptual meaning only.
Output one concise, neutral, impersonal paragraph.

Output only the rewritten text.`;
}

async function callModel(promptText) {
  // Keep model invocation in one place so retry/logging can be added later without touching business logic.
  const response = await openai.responses.create({
    model: rewriteModel,
    input: [
      {
        role: "user",
        content: promptText
      }
    ]
  });

  const text = extractResponsesText(response);
  if (!text) {
    throw new Error("Model returned empty text.");
  }
  return text;
}

function parseJsonFromModel(rawText) {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    throw new Error("Model returned empty JSON payload.");
  }

  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(withoutFence);
  } catch (_error) {
    const jsonBlockMatch = withoutFence.match(/\{[\s\S]*\}/);
    if (!jsonBlockMatch) {
      throw new Error("Model returned non-JSON payload.");
    }
    return JSON.parse(jsonBlockMatch[0]);
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseStep1Payload(rawText) {
  // Step 1 returns both corrected text and a structured skeleton used by later steps.
  const parsed = parseJsonFromModel(rawText);
  const step1 = String(parsed?.step1 || "").trim();

  if (!step1) {
    throw new Error("Prompt A payload missing step1.");
  }

  const skeletonInput = parsed?.skeleton && typeof parsed.skeleton === "object" ? parsed.skeleton : {};
  const skeleton = {
    core_states: normalizeStringArray(skeletonInput.core_states),
    relations: normalizeStringArray(skeletonInput.relations),
    core_events: normalizeStringArray(skeletonInput.core_events),
    symbols_to_abstract: normalizeStringArray(skeletonInput.symbols_to_abstract),
    scene_details_to_remove: normalizeStringArray(skeletonInput.scene_details_to_remove),
    one_sentence_summary: String(skeletonInput.one_sentence_summary || "").trim()
  };

  if (!skeleton.one_sentence_summary) {
    throw new Error("Prompt A payload missing skeleton.one_sentence_summary.");
  }

  return { step1, skeleton };
}

function containsAnyToken(text, tokens) {
  const source = String(text || "").toLowerCase();
  for (const token of tokens || []) {
    const cleanToken = String(token || "").trim().toLowerCase();
    if (!cleanToken) {
      continue;
    }
    if (source.includes(cleanToken)) {
      return true;
    }
  }
  return false;
}

function isTooPoetic(step3, skeleton) {
  const text = String(step3 || "").trim();
  if (!text) {
    return true;
  }

  if (containsAnyToken(text, skeleton?.symbols_to_abstract)) {
    return true;
  }

  const visualNouns = [
    "moon",
    "rain",
    "wind",
    "ocean",
    "sea",
    "river",
    "snow",
    "night",
    "shadow",
    "forest",
    "flower",
    "mirror",
    "fire",
    "sky",
    "sun"
  ];

  let visualHits = 0;
  const lowered = text.toLowerCase();
  for (const noun of visualNouns) {
    if (lowered.includes(noun)) {
      visualHits += 1;
      if (visualHits >= 2) {
        return true;
      }
    }
  }

  return false;
}

async function generateThreeSteps(userInput) {
  // Pipeline: correction -> optimization -> standardization (+ optional flatten pass).
  const result1 = await callModel(buildPromptA(userInput));
  const parsed1 = parseStep1Payload(result1);

  const step1 = parsed1.step1;
  const skeleton = parsed1.skeleton;

  const step2 = (await callModel(buildPromptB(step1, skeleton))).trim();
  let step3 = (await callModel(buildPromptC(step2, skeleton))).trim();

  if (isTooPoetic(step3, skeleton)) {
    step3 = (await callModel(buildPromptD(step3, skeleton))).trim();
  }

  return {
    step1,
    step2,
    step3,
    skeleton
  };
}

// HTTP routes: main rewrite API + health/debug helpers.
app.post("/api/three-steps", async (req, res) => {
  // Main endpoint used by the frontend rewrite workflow.
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Server is missing API credentials." });
    }

    const userText = String(req.body?.text || "").trim();
    if (!userText) {
      return res.status(400).json({ error: "text is required" });
    }

    const result = await generateThreeSteps(userText);
    return res.json(result);
  } catch (error) {
    const message = error?.message || "Unknown server error";
    console.error("Three-steps endpoint failed:", message);
    return res.status(500).json({ error: message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/debug/assistants", async (_req, res) => {
  // Debug helper: quickly verify whether API key/model access is valid.
  try {
    if (!apiKey) {
      return res.status(500).json({ error: "Server is missing API credentials." });
    }

    const assistants = await openai.beta.assistants.list({ limit: 50 });
    return res.json({
      count: assistants.data.length,
      assistants: assistants.data.map((assistant) => ({
        id: assistant.id,
        name: assistant.name || "",
        model: assistant.model || ""
      }))
    });
  } catch (error) {
    const message = error?.message || "Unknown server error";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/debug/config", (_req, res) => {
  // Debug helper: expose non-secret runtime config for troubleshooting.
  res.json({
    rewriteModel,
    hasApiKey: Boolean(apiKey)
  });
});

app.listen(port, () => {
  console.log(`Rewrite server running at http://localhost:${port}`);
});
