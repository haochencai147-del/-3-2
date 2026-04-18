
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ override: true });

const app = express();
const PORT = Number(process.env.PORT || 8787);
const rewriteModel = process.env.REWRITE_MODEL || "gpt-4.1-mini";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const distIndexPath = path.join(__dirname, "dist", "index.html");

// Serve Vite build output
app.use(express.static(path.join(__dirname, "dist")));

function extractResponseText(response) {
  const direct = String(response?.output_text || "").trim();
  if (direct) {
    return direct;
  }

  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && part?.text) {
        return String(part.text).trim();
      }
    }
  }

  return "";
}

async function callModel(prompt) {
  const response = await openai.responses.create({
    model: rewriteModel,
    input: [{ role: "user", content: prompt }]
  });
  const text = extractResponseText(response);
  if (!text) {
    throw new Error("Model returned empty text.");
  }
  return text;
}

function buildStep2Prompt(step1) {
  return `Rewrite the text into clearer, smoother, neutral language while preserving meaning.
Avoid poetic style and vivid imagery.

Text:
${step1}`;
}

function buildStep3Prompt(step2) {
  return `Rewrite into maximally generic, impersonal, context-neutral language.
Remove symbolic imagery and keep conceptual meaning only.

Text:
${step2}`;
}

app.post("/api/three-steps", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server is missing OPENAI_API_KEY." });
    }

    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    const step1 = text;
    const step2 = (await callModel(buildStep2Prompt(step1))).trim();
    const step3 = (await callModel(buildStep3Prompt(step2))).trim();

    return res.json({
      step1,
      step2,
      step3,
      skeleton: null
    });
  } catch (error) {
    const message = error?.message || "Unknown server error";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// All frontend routes return index.html
app.get(/.*/, (_req, res) => {
  if (fs.existsSync(distIndexPath)) {
    return res.sendFile(distIndexPath);
  }

  return res.status(404).send("Frontend build not found. Run: npm run build");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
