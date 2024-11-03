import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [currentArabicText, setCurrentArabicText] = useState("");
  const [currentEnglishText, setCurrentEnglishText] = useState("");

  const [surahNumber] = useState(2);
  const [ayahNumber, setAyahNumber] = useState(1);
  const [audio] = useState(new Audio());

  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (playing) {
      startAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ayahNumber]);

  async function play() {
    setPlaying(true);
  }

  async function startAudio() {
    // Get arabic and english text for current ayah, and set current text states
    const [arabicText, englishText] = await Promise.all([
      getAyahArabicText(surahNumber, ayahNumber),
      getAyahEnglishText(surahNumber, ayahNumber),
    ]);

    setCurrentArabicText(arabicText);
    setCurrentEnglishText(englishText);

    // Play audio for current ayah
    audio.src = getAyahAudioURL(surahNumber, ayahNumber);
    audio.play();
    audio.onended = () => {
      setAyahNumber(ayahNumber + 1);
    };
  }

  /* ---------- API Data Getters ---------- */

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

  /* ---------- API URL Getters ---------- */

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
      <h1>QuranPrompt</h1>
      <button onClick={play}>Start</button>
      {playing && (
        <div className="text">
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
