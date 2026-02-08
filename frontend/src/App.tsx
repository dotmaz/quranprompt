import { useState, useEffect, useRef } from "react";
import "./App.css";

import { z } from "zod";
import { RunContext, Agent, AgentInputItem, Runner, withTrace, setDefaultOpenAIClient } from "@openai/agents";
import OpenAI from "openai";

type SurahRange = {
  surah: number;
  startAyah: number;
  endAyah: number;
  repeatAyahCount: number;
  repeatRangeCount: number;
}

/* AGENT STUFF will be moved to backend */

setDefaultOpenAIClient(new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
}));

const MyAgentSchema = z.object({ surah: z.number(), startAyah: z.number(), endAyah: z.number(), repeatAyahCount: z.number(), repeatRangeCount: z.number() });
interface MyAgentContext {
  workflowInputAsText: string;
}
const myAgentInstructions = (runContext: RunContext<MyAgentContext>, _agent: Agent<MyAgentContext, typeof MyAgentSchema>) => {
  const { workflowInputAsText } = runContext.context;
  return `Take the following request for a surah/ayah repeat configuration and output an object representing it.

Request:
${workflowInputAsText}`
}
const myAgent = new Agent({
  name: "My agent",
  instructions: myAgentInstructions,
  model: "gpt-4.1",
  outputType: MyAgentSchema,
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

type WorkflowInput = { input_as_text: string };


// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("Quran Range Assistant", async () => {
    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
    ];
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_698822a14b748190aca40246534c9d6701a89f2abaa5be26"
      }
    });
    const myAgentResultTemp = await runner.run(
      myAgent,
      [
        ...conversationHistory
      ],
      {
        context: {
          workflowInputAsText: workflow.input_as_text
        }
      }
    );
    conversationHistory.push(...myAgentResultTemp.newItems.map((item) => item.rawItem));

    if (!myAgentResultTemp.finalOutput) {
      throw new Error("Agent result is undefined");
    }

    const myAgentResult = {
      output_text: JSON.stringify(myAgentResultTemp.finalOutput),
      output_parsed: myAgentResultTemp.finalOutput
    };

    return myAgentResult;
  });
}


/*---------------------------------------*/

const STARTING_SURAH = 1;
const STARTING_AYAH = 1;
const STARTING_REPEAT_ON_AYAH_NUMBER = 30; // 30 ayahs in surah 86 fajr
const STARTING_REPEAT_AYAH_COUNT = 1;
const STARTING_REPEAT_RANGE_COUNT = 1;

function App() {
  const [surahNumber, setSurahNumber] = useState(STARTING_SURAH);
  const [ayahNumber, setAyahNumber] = useState(STARTING_AYAH);

  const [currentArabicText, setCurrentArabicText] = useState("");
  const [currentEnglishText, setCurrentEnglishText] = useState("");

  const [surahRange, setSurahRange] = useState<SurahRange | null>(null);
  const [repeatAyahCount, setRepeatAyahCount] = useState(1);
  const [repeatRangeCount, setRepeatRangeCount] = useState(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(new Audio());

  const [aiText, setAiText] = useState('play shortest ayah in the quran twice');

  // Keep an updated ref for async callbacks
  const dataRef = useRef({
    ayahNumber,
    surahNumber,
    surahRange,
    repeatAyahCount,
    repeatRangeCount,
    isPlaying
  });
  useEffect(() => {
    dataRef.current = {
      ayahNumber,
      surahNumber,
      surahRange,
      repeatAyahCount,
      repeatRangeCount,
      isPlaying
    }
  }, [ayahNumber, surahNumber, surahRange, repeatAyahCount, repeatRangeCount, isPlaying])

  const [tick, setTick] = useState(false);

  // When an ayah number chnages, start playing
  useEffect(() => {
    startAyah()
  }, [ayahNumber, tick])

  /* ---------- Helper Functions ---------- */

  // Play the current ayah
  async function startAyah() {
    const { isPlaying, surahNumber, ayahNumber } = dataRef.current;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    // Retrieve & set current ayah text and translation
    const ayahText = await getAyahText(surahNumber, ayahNumber);
    setCurrentArabicText(ayahText.arabic);
    setCurrentEnglishText(ayahText.english);

    // Play audio for current ayah
    playAyahAudio();
  }

  // Plays the audio for current ayah, and increments the ayah number on finish
  function playAyahAudio() {
    const { ayahNumber, surahNumber, surahRange, repeatAyahCount, repeatRangeCount } = dataRef.current;
    audio.src = getAyahAudioURL(surahNumber, ayahNumber);
    audio.play();
    audio.onended = () => {
      // No range selected; play sequential ayahs
      if (!surahRange) {
        setAyahNumber(prev => prev + 1);
        return;
      }

      // ----- Range has been selected -----

      // We haven't repeated the ayah enough times, play the same ayah again
      if (repeatAyahCount < surahRange.repeatAyahCount) {
        setRepeatAyahCount(prev => prev + 1);
        startAyah();
        return;
      }

      // We repeated the ayah enough times. Is this the last ayah in the range?
      if (ayahNumber === surahRange.endAyah) {

        // Yes last ayah in range, but our range repeat count hasn't met the set one. Repeat the whole thing back at the starting ayah!
        if (repeatRangeCount < surahRange.repeatRangeCount) {
          setRepeatAyahCount(1);
          setRepeatRangeCount(prev => prev + 1);
          setAyahNumber(surahRange.startAyah);
          return;
        }

        // Yes last ayah in range, and we just finished the last range repeat. DONE -- TURN OFF AUDIO!
        setIsPlaying(false);
        setRepeatAyahCount(1);
        setRepeatRangeCount(1);
        setAyahNumber(surahRange.startAyah);
        return;
      }

      // No not last ayah in the range, move on to the next ayah
      setRepeatAyahCount(1);
      setAyahNumber(prev => prev + 1);
      return;
    };
  }

  async function playWithAI() {
    const surahRange: SurahRange = (await runWorkflow({
      input_as_text: aiText
    })).output_parsed;

    playSurahRange(surahRange);
  }

  async function playSurahRange(surahRange: SurahRange) {
    const { ayahNumber } = dataRef.current;
    setIsPlaying(true);
    setSurahRange(surahRange);
    setSurahNumber(surahRange.surah);
    setRepeatAyahCount(1);
    setRepeatRangeCount(1);
    setAyahNumber(surahRange.startAyah);
    if (ayahNumber === surahRange.startAyah) {
      setTick(prev => !prev);
    }
  }

  /* ---------- API Data Getters ---------- */

  async function getAyahText(surahNumber: number, ayahNumber: number) {
    const [arabicText, englishText] = await Promise.all([
      getAyahArabicText(surahNumber, ayahNumber),
      getAyahEnglishText(surahNumber, ayahNumber),
    ]);
    return {
      arabic: arabicText,
      english: englishText
    }
  }

  async function getAyahArabicText(surahNumber: number, ayahNumber: number) {
    const response = await fetch(
      getAyahArabicTextURL(surahNumber, ayahNumber)
    ).then((res) => res.json());

    // Perform arabic text modifications
    let text = response.data.text;
    text = textModificationRemoveBismillah(text, surahNumber, ayahNumber);
    text = textModificationReplaceBrokenCharacters(text);

    return text;
  }

  async function getAyahEnglishText(surahNumber: number, ayahNumber: number) {
    const response = await fetch(
      getAyahEnglishTextURL(surahNumber, ayahNumber)
    ).then((res) => res.json());
    return response.data.text;
  }

  /* ---------- API URL Helpers ---------- */
  function getAyahArabicTextURL(surahNumber: number, ayahNumber: number) {
    return `https://api.alquran.cloud/v1/ayah/${surahNumber}:${ayahNumber}`;
  }

  function getAyahEnglishTextURL(surahNumber: number, ayahNumber: number) {
    return `https://api.alquran.cloud/v1/ayah/${surahNumber}:${ayahNumber}/en.asad`;
  }

  function getAyahAudioURL(surahNumber: number, ayahNumber: number) {
    const audioFilename =
      String(surahNumber).padStart(3, "0") +
      String(ayahNumber).padStart(3, "0");
    return `https://everyayah.com/data/Alafasy_128kbps/${audioFilename}.mp3`;
  }

  /* ---------- Text Modification Helper Functions ---------- */

  function textModificationRemoveBismillah(
    text: string,
    surahNumber: number,
    ayahNumber: number
  ) {
    if (surahNumber !== 1 && ayahNumber === 1) {
      return text.split(" ").slice(4).join(" "); // Remove bismillah from beginning of all surahs except Al-Fatiha
    } else {
      return text;
    }
  }

  function textModificationReplaceBrokenCharacters(text: string) {
    // TODO: There are more broken characters that need to be fixed. Such as dagger alifs, other letters with madah (see beginning of baqarah, etc.)
    // Probably need to find a font that supports everything

    text = text.replaceAll("\u{06DF}", "\u{0652}"); // Fixes alif sukun
    text = text.replaceAll("\u06CC", "\u064A"); // Fixes broken yah (replaces persian yah with arabic yah)
    text = text.replaceAll("\u0627\u06E4", "\u0622"); // Fixes broken alif with maddah
    text = text.replaceAll("\u0646\u08f2", "\u0646\u0656"); // Fixes broken noon with double kasrah
    text = text.replaceAll("\u0645\u06e4", "\u0645\u0653"); // Fixes broken meem with maddah
    text = text.replaceAll("\u0644\u06e4", "\u0644\u0653"); // Fixes broken lam with maddah
    return text;
  }

  return (
    <div className="app">
      <div className="button-container">
        <button className="button" onClick={() => { setIsPlaying(cur => !cur) }}>Play/Pause</button>
        <button className="button" onClick={() => { setAyahNumber(cur => cur - 1) }}>{'<'}</button>
        <button className="button" onClick={() => { setAyahNumber(cur => cur + 1) }}>{'>'}</button>
      </div>
      <div className="text-input-container">
        <input
          type='text'
          className="input-text"
          placeholder='AI request'
          value={aiText}
          onChange={e => setAiText(e.target.value)}
        />
        <button className="button" onClick={playWithAI}>Play with AI</button>
      </div>
      {(
        <div className="text-container">
          <p className="englishText">
            {surahNumber}:{ayahNumber}
          </p>
          <p className="arabicText">{currentArabicText}</p>
          <p className="englishText">{currentEnglishText}</p>
        </div>
      )}
    </div>
  );
}

export default App;
