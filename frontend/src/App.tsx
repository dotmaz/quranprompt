import { useState, useEffect, useRef } from "react";
import "./App.css";
import surahNames from "./constants/surahNames";
import { FaPause, FaPlay, FaAngleLeft, FaAngleRight } from "react-icons/fa";
console.log("node env", process.env.NODE_ENV);
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const BACKEND_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://quranprompt.onrender.com";
const SESSION_ID = crypto.randomUUID();

type SurahRange = {
  surah: number;
  startAyah: number;
  endAyah: number;
  repeatAyahCount: number;
  repeatRangeCount: number;
};

/*---------------------------------------*/

const STARTING_SURAH = 0;
const STARTING_AYAH = 0;

function App() {
  const [surahNumber, setSurahNumber] = useState(STARTING_SURAH);
  const [ayahNumber, setAyahNumber] = useState(STARTING_AYAH);
  const [numberOfAyahs, setNumberOfAyahs] = useState<number | null>(null);

  const [currentArabicText, setCurrentArabicText] = useState("");
  const [currentEnglishText, setCurrentEnglishText] = useState("");

  const [surahRange, setSurahRange] = useState<SurahRange | null>(null);
  const [repeatAyahCount, setRepeatAyahCount] = useState(1);
  const [repeatRangeCount, setRepeatRangeCount] = useState(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(new Audio());
  const [audioPaused, setAudioPaused] = useState(true);

  const [aiText, setAiText] = useState("al fajr");

  // Keep an updated ref for async callbacks
  const dataRef = useRef({
    ayahNumber,
    surahNumber,
    numberOfAyahs,
    surahRange,
    repeatAyahCount,
    repeatRangeCount,
    isPlaying,
  });
  useEffect(() => {
    dataRef.current = {
      ayahNumber,
      surahNumber,
      numberOfAyahs,
      surahRange,
      repeatAyahCount,
      repeatRangeCount,
      isPlaying,
    };
  }, [
    ayahNumber,
    surahNumber,
    numberOfAyahs,
    surahRange,
    repeatAyahCount,
    repeatRangeCount,
    isPlaying,
  ]);

  const [tick, setTick] = useState(false);
  const surahName = surahNames[surahNumber.toString()];

  // When an ayah number changes, start playing
  useEffect(() => {
    const { numberOfAyahs } = dataRef.current;
    if (numberOfAyahs === null) {
      startAyah();
      return;
    }
    if (ayahNumber <= 0) {
      setAyahNumber(numberOfAyahs);
      return;
    }
    if (ayahNumber > numberOfAyahs) {
      setAyahNumber(1);
      return;
    }
    startAyah();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayahNumber, tick]);

  /* ---------- Helper Functions ---------- */

  // Play the current ayah
  async function startAyah() {
    const { isPlaying, surahNumber, ayahNumber } = dataRef.current;

    if (!isPlaying) {
      audio.pause();
      setAudioPaused(true);
      return;
    }

    setAudioPaused(false);

    // Retrieve & set current ayah text and translation
    const ayahText = await getAyahText(surahNumber, ayahNumber);
    setCurrentArabicText(ayahText.arabic);
    setCurrentEnglishText(ayahText.english);

    // Play audio for current ayah
    playAyahAudio();
  }

  // Plays the audio for current ayah, and increments the ayah number on finish
  function playAyahAudio() {
    const {
      ayahNumber,
      surahNumber,
      surahRange,
      repeatAyahCount,
      repeatRangeCount,
    } = dataRef.current;
    try {
      audio.src = getAyahAudioURL(surahNumber, ayahNumber);
      audio.play();
    } catch (error) {
      return;
    }
    audio.onended = () => {
      // No range selected; play sequential ayahs
      if (!surahRange) {
        setAyahNumber((prev) => prev + 1);
        return;
      }

      // ----- Range has been selected -----

      // We haven't repeated the ayah enough times, play the same ayah again
      if (repeatAyahCount < surahRange.repeatAyahCount) {
        setRepeatAyahCount((prev) => prev + 1);
        startAyah();
        return;
      }

      // We repeated the ayah enough times. Is this the last ayah in the range?
      if (ayahNumber === surahRange.endAyah) {
        // Yes last ayah in range, but our range repeat count hasn't met the set one. Repeat the whole thing back at the starting ayah!
        if (repeatRangeCount < surahRange.repeatRangeCount) {
          setRepeatAyahCount(1);
          setRepeatRangeCount((prev) => prev + 1);
          setAyahNumber(surahRange.startAyah);
          return;
        }

        // Yes last ayah in range, and we just finished the last range repeat. DONE -- TURN OFF AUDIO!
        setIsPlaying(false);
        setAudioPaused(true);
        setRepeatAyahCount(1);
        setRepeatRangeCount(1);
        setAyahNumber(surahRange.startAyah);
        return;
      }

      // No not last ayah in the range, move on to the next ayah
      setRepeatAyahCount(1);
      setAyahNumber((prev) => prev + 1);
      return;
    };
  }

  async function playWithAI() {
    const surahRange: SurahRange = await fetch(
      `${BACKEND_URL}/api/parse-range`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": SESSION_ID,
        },
        body: JSON.stringify({ input_as_text: aiText }),
      },
    ).then((r) => r.json());

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
      setTick((prev) => !prev);
    }
  }

  function playPause() {
    if (audio.paused) {
      audio.play();
      setAudioPaused(false);
    } else {
      audio.pause();
      setAudioPaused(true);
    }
  }

  function nextAyah() {
    const { surahRange } = dataRef.current;
    if (surahRange === null) {
      setAyahNumber((cur) => cur + 1);
    } else {
      setAyahNumber((cur) => cur + 1);
      setSurahRange(null);
    }
  }

  function previousAyah() {
    const { surahRange } = dataRef.current;
    if (surahRange === null) {
      setAyahNumber((cur) => cur - 1);
    } else {
      setAyahNumber((cur) => cur - 1);
      setSurahRange(null);
    }
  }

  /* ---------- API Data Getters ---------- */

  async function getAyahText(surahNumber: number, ayahNumber: number) {
    const response = await fetch(
      `${BACKEND_URL}/api/ayah/${surahNumber}/${ayahNumber}`,
    ).then((r) => r.json());
    if (response.numberOfAyahs !== null) {
      setNumberOfAyahs(response.numberOfAyahs);
    }
    return {
      arabic: textModificationReplaceBrokenCharacters(
        textModificationRemoveBismillah(
          response.arabic,
          surahNumber,
          ayahNumber,
        ),
      ),
      english: response.english,
    };
  }

  /* ---------- API URL Helpers ---------- */

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
    ayahNumber: number,
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
      {IS_DEVELOPMENT && (
        <div
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            left: 10,
            background: "orange",
            color: "white",
            padding: "6px 16px",
            borderRadius: "8px",
            fontWeight: "bold",
            zIndex: 9999,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            textAlign: "center",
          }}
        >
          DEVELOPMENT
        </div>
      )}
      {/* Surah Range Modal */}
      {surahRange && (
        <div className="range-modal">
          <div className="range-modal-title">
            {surahNames[surahRange.surah.toString()]}
          </div>
          <div className="range-modal-row">
            <span className="range-modal-label">Current ayah</span>
            <span className="range-modal-value">{ayahNumber}</span>
          </div>
          <div className="range-modal-row">
            <span className="range-modal-label">Ayah range</span>
            <span className="range-modal-value">
              {surahRange.startAyah === surahRange.endAyah
                ? surahRange.startAyah
                : `${surahRange.startAyah} – ${surahRange.endAyah}`}
            </span>
          </div>
          <div className="range-modal-row">
            <span className="range-modal-label">Ayah repeat</span>
            <span className="range-modal-value">
              {repeatAyahCount} / {surahRange.repeatAyahCount}
            </span>
          </div>
          <div className="range-modal-row">
            <span className="range-modal-label">Range repeat</span>
            <span className="range-modal-value">
              {repeatRangeCount} / {surahRange.repeatRangeCount}
            </span>
          </div>
        </div>
      )}

      {/* AI Search */}
      <div className="text-input-container">
        <button className="button" onClick={playWithAI}>
          Play custom loop
        </button>
        <input
          type="text"
          className="input-text"
          placeholder="AI request"
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />
      </div>

      {/* Player Controls */}
      <div className="button-container">
        <button className="button" onClick={playPause}>
          {audioPaused ? (
            // @ts-ignore
            <FaPlay />
          ) : (
            // @ts-ignore
            <FaPause />
          )}
        </button>
        <button className="button icon" onClick={previousAyah}>
          {
            // @ts-ignore
            <FaAngleLeft />
          }
        </button>
        <button className="button icon" onClick={nextAyah}>
          {
            // @ts-ignore
            <FaAngleRight />
          }
        </button>
      </div>

      {/* Surah Name / Ayah Text */}
      {ayahNumber > 0 && surahNumber > 0 && (
        <div className="text-container">
          <p className="englishText surahName">{surahName}</p>
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
