import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { z } from "zod";
import { RunContext, Agent, AgentInputItem, Runner, withTrace, setDefaultOpenAIClient } from "@openai/agents";
import OpenAI from "openai";

dotenv.config({ path: path.resolve(__dirname, ".env") });

type SurahRange = {
  surah: number;
  startAyah: number;
  endAyah: number;
  repeatAyahCount: number;
  repeatRangeCount: number;
};

/* ---------- AI Agent ---------- */

setDefaultOpenAIClient(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

const MyAgentSchema = z.object({
  surah: z.number(),
  startAyah: z.number(),
  endAyah: z.number(),
  repeatAyahCount: z.number(),
  repeatRangeCount: z.number(),
});

interface MyAgentContext {
  workflowInputAsText: string;
}

const myAgentInstructions = (
  runContext: RunContext<MyAgentContext>,
  _agent: Agent<MyAgentContext, typeof MyAgentSchema>
) => {
  const { workflowInputAsText } = runContext.context;
  return `Take the following request for a surah/ayah repeat configuration and output an object representing it.

Request:
${workflowInputAsText}`;
};

const myAgent = new Agent({
  name: "My agent",
  instructions: myAgentInstructions,
  model: "gpt-4.1",
  outputType: MyAgentSchema,
  modelSettings: { temperature: 1, topP: 1, maxTokens: 2048, store: true },
});

async function runWorkflow(inputAsText: string): Promise<SurahRange> {
  return await withTrace("Quran Range Assistant", async () => {
    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: inputAsText }] },
    ];
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_698822a14b748190aca40246534c9d6701a89f2abaa5be26",
      },
    });
    const result = await runner.run(myAgent, conversationHistory, {
      context: { workflowInputAsText: inputAsText },
    });

    if (!result.finalOutput) throw new Error("Agent result is undefined");
    return result.finalOutput as SurahRange;
  });
}

/* ---------- Express ---------- */

const app = express();
app.use(cors());
app.use(express.json());

const parseRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.headers["x-session-id"] as string) || req.ip || "unknown",
  message: { error: "Too many requests, please reload the page." },
});

// POST /api/parse-range  { input_as_text: string } => SurahRange
app.post("/api/parse-range", parseRateLimiter, async (req, res) => {
  const { input_as_text } = req.body as { input_as_text: string };
  const surahRange = await runWorkflow(input_as_text);
  res.json(surahRange);
});

// GET /api/ayah/:surah/:ayah => { arabic: string, english: string, numberOfAyahs: number }
app.get("/api/ayah/:surah/:ayah", async (req, res) => {
  const { surah, ayah } = req.params;
  const [arabicRes, englishRes] = await Promise.all([
    fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}`).then((r) => r.json()),
    fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.asad`).then((r) => r.json()),
  ]);

  try {
    res.json({
      arabic: (arabicRes as any)?.data?.text ?? "",
      english: (englishRes as any)?.data?.text ?? "",
      numberOfAyahs: (arabicRes as any)?.data?.surah?.numberOfAyahs ?? null,
    });
  } catch (error) {
    res.json({ error })
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
