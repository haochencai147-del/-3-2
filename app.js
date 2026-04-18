import pretext from "pretext";

function resolveApiEndpoint() {
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) {
    return "http://localhost:8787/api/three-steps";
  }
  return "/api/three-steps";
}

const API_CONFIG = {
  threeStepsEndpoint: resolveApiEndpoint()
};

const startScreen = document.getElementById("startScreen");
const inputScreen = document.getElementById("inputScreen");
const resultScreen = document.getElementById("resultScreen");
const startPretextOutput = document.getElementById("startPretextOutput");
const enterBtn = document.getElementById("enterBtn");
const userInput = document.getElementById("userInput");
const generateBtn = document.getElementById("generateBtn");
const soundTestBtn = document.getElementById("soundTestBtn");
const ambientToggleBtn = document.getElementById("ambientToggleBtn");
const regenerateBtn = document.getElementById("regenerateBtn");
const backBtn = document.getElementById("backBtn");
const statusText = document.getElementById("statusText");
const resultOutput = document.getElementById("resultOutput");
const resultProgressBox = document.getElementById("resultProgressBox");
const inputProgressBox = document.getElementById("inputProgressBox");
const inputProgressLabel = document.getElementById("inputProgressLabel");
const liveRewriteOutput = document.getElementById("liveRewriteOutput");

let lastInputText = "";
let liveRewriteTimer = null;
let liveRewriteController = null;
let liveRewriteRequestId = 0;
let isApplyingRewrite = false;
let executionSceneTimeouts = [];
let executionSceneController = null;
let flowRandomizerTimer = null;
let flowTokenAnimations = [];
let flowTokenTimers = [];
let sinkTokenAnimations = [];
let executionComplete = false;
let audioContext = null;
let audioMasterGain = null;
let soundUnlocked = false;
let ambientEnabled = false;
let ambientOscillators = [];
let ambientLfo = null;
let ambientBusGain = null;
let ambientFilter = null;

const VORTEX_MOTION = {
  speed: 0.62,
  driftSpeed: 0.48,
  firstSpinSpeed: 0.4
};

const START_SCREEN_PRETEXT =
  "Input will be *analyzed*, /aligned/, and optimized toward a common structure.";

function ensureAudioReady() {
  try {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return null;
      }

      audioContext = new AudioCtx();
      audioMasterGain = audioContext.createGain();
      audioMasterGain.gain.value = 0.28;
      audioMasterGain.connect(audioContext.destination);

      ambientBusGain = audioContext.createGain();
      ambientBusGain.gain.value = 0.0001;

      ambientFilter = audioContext.createBiquadFilter();
      ambientFilter.type = "lowpass";
      ambientFilter.frequency.value = 840;
      ambientFilter.Q.value = 0.8;

      ambientBusGain.connect(ambientFilter);
      ambientFilter.connect(audioMasterGain);
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    soundUnlocked = true;
    return audioContext;
  } catch (_error) {
    return null;
  }
}

function playTone({
  frequency,
  startAt,
  duration = 0.08,
  volume = 0.04,
  type = "sine",
  attack = 0.004,
  release = 0.06
}) {
  if (!audioContext || !audioMasterGain) {
    return;
  }

  const osc = audioContext.createOscillator();
  const amp = audioContext.createGain();
  const now = audioContext.currentTime;
  const start = Math.max(now, startAt ?? now + 0.003);
  const end = start + Math.max(0.02, duration);
  const peak = Math.max(0.001, Math.min(volume, 0.22));

  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, frequency), start);

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(peak, start + Math.min(attack, duration * 0.45));
  amp.gain.exponentialRampToValueAtTime(0.0001, end + Math.max(0.01, release));

  osc.connect(amp);
  amp.connect(audioMasterGain);

  osc.start(start);
  osc.stop(end + Math.max(0.01, release));
}

function playUiClickSound() {
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }

  const t = ctx.currentTime + 0.005;
  playTone({ frequency: 720, startAt: t, duration: 0.06, volume: 0.065, type: "square" });
  playTone({ frequency: 960, startAt: t + 0.055, duration: 0.065, volume: 0.056, type: "triangle" });
}

function playUiSuccessSound() {
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }

  const t = ctx.currentTime + 0.01;
  playTone({ frequency: 392, startAt: t, duration: 0.09, volume: 0.058, type: "triangle" });
  playTone({ frequency: 523.25, startAt: t + 0.08, duration: 0.11, volume: 0.06, type: "triangle" });
  playTone({ frequency: 659.25, startAt: t + 0.19, duration: 0.16, volume: 0.065, type: "triangle" });
}

function playUiErrorSound() {
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }

  const t = ctx.currentTime + 0.005;
  playTone({ frequency: 420, startAt: t, duration: 0.1, volume: 0.062, type: "sawtooth" });
  playTone({ frequency: 290, startAt: t + 0.085, duration: 0.14, volume: 0.066, type: "sawtooth" });
}

function playPhaseTickSound(phaseNumber) {
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }

  const base = 280 + Math.max(0, Math.min(7, phaseNumber)) * 52;
  const t = ctx.currentTime + 0.004;
  playTone({ frequency: base, startAt: t, duration: 0.055, volume: 0.032, type: "sine", release: 0.03 });
  playTone({ frequency: base * 1.5, startAt: t + 0.04, duration: 0.055, volume: 0.028, type: "triangle", release: 0.03 });
}

function playTestSound() {
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }

  const t = ctx.currentTime + 0.01;
  playTone({ frequency: 523.25, startAt: t, duration: 0.08, volume: 0.07, type: "triangle" });
  playTone({ frequency: 659.25, startAt: t + 0.08, duration: 0.08, volume: 0.07, type: "triangle" });
  playTone({ frequency: 783.99, startAt: t + 0.16, duration: 0.12, volume: 0.075, type: "triangle" });
}

function updateAmbientButtonLabel() {
  if (!ambientToggleBtn) {
    return;
  }
  ambientToggleBtn.textContent = ambientEnabled ? "AMBIENT: ON" : "AMBIENT: OFF";
}

function startAmbientBackground() {
  const ctx = ensureAudioReady();
  if (!ctx || !ambientBusGain || !ambientFilter) {
    return;
  }

  if (ambientOscillators.length) {
    return;
  }

  const now = ctx.currentTime;
  const chord = [110, 164.81, 220.0, 329.63];
  const waveTypes = ["triangle", "sawtooth", "triangle", "sine"];

  chord.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const voiceGain = ctx.createGain();
    osc.type = waveTypes[index % waveTypes.length];
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);
    voiceGain.gain.value = index === 0 ? 0.018 : 0.012;
    osc.connect(voiceGain);
    voiceGain.connect(ambientBusGain);
    osc.start(now + index * 0.03);
    ambientOscillators.push(osc);
  });

  ambientLfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  ambientLfo.type = "sine";
  ambientLfo.frequency.setValueAtTime(0.065, now);
  lfoDepth.gain.value = 220;
  ambientLfo.connect(lfoDepth);
  lfoDepth.connect(ambientFilter.frequency);
  ambientLfo.start(now);

  ambientBusGain.gain.cancelScheduledValues(now);
  ambientBusGain.gain.setValueAtTime(Math.max(0.0001, ambientBusGain.gain.value), now);
  ambientBusGain.gain.exponentialRampToValueAtTime(0.7, now + 1.2);
}

function stopAmbientBackground() {
  if (!audioContext || !ambientBusGain) {
    ambientOscillators = [];
    ambientLfo = null;
    return;
  }

  const now = audioContext.currentTime;
  ambientBusGain.gain.cancelScheduledValues(now);
  ambientBusGain.gain.setValueAtTime(Math.max(0.0001, ambientBusGain.gain.value), now);
  ambientBusGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

  for (const osc of ambientOscillators) {
    try {
      osc.stop(now + 0.75);
    } catch (_error) {
    }
  }
  ambientOscillators = [];

  if (ambientLfo) {
    try {
      ambientLfo.stop(now + 0.75);
    } catch (_error) {
    }
    ambientLfo = null;
  }
}

function toggleAmbientBackground() {
  ambientEnabled = !ambientEnabled;
  if (ambientEnabled) {
    startAmbientBackground();
  } else {
    stopAmbientBackground();
  }
  updateAmbientButtonLabel();
}

function normalizeClientErrorMessage(error) {
  const raw = String(error?.message || "").trim();
  const lowered = raw.toLowerCase();

  if (!raw || lowered.includes("failed to fetch") || lowered.includes("networkerror")) {
    return "Connection failed: please make sure the backend is running (npm start).";
  }

  if (lowered.includes("server is missing api credentials")) {
    return "Server is missing OPENAI_API_KEY. Please check your .env configuration.";
  }

  return raw;
}

function renderPretext(target, text) {
  if (!target) {
    return;
  }

  const raw = String(text || "").trim();
  if (!raw) {
    target.innerHTML = "";
    return;
  }

  try {
    const safeSource = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    target.innerHTML = pretext(safeSource);
  } catch (_error) {
    target.textContent = raw;
  }
}

function setActiveScreen(targetScreen) {
  if (startScreen) {
    startScreen.classList.toggle("active", targetScreen === startScreen);
  }
  if (inputScreen) {
    inputScreen.classList.toggle("active", targetScreen === inputScreen);
  }
  if (resultScreen) {
    resultScreen.classList.toggle("active", targetScreen === resultScreen);
  }
}

function showStartScreen() {
  setActiveScreen(startScreen);
}

function showInputScreen() {
  startScreen.classList.remove("active");
  inputScreen.classList.add("active");
  resultScreen.classList.remove("active");
  clearExecutionScene();
  if (userInput) {
    userInput.value = "";
  }
  lastInputText = "";
  if (liveRewriteOutput) {
    renderPretext(liveRewriteOutput, "");
  }
  if (inputProgressBox) {
    inputProgressBox.classList.remove("loading");
    inputProgressLabel.textContent = "Awaiting Input..";
  }
}

function showResultScreen() {
  setActiveScreen(resultScreen);
}

function isFullscreenActive() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

async function requestFullscreenMode() {
  if (isFullscreenActive()) {
    return;
  }

  const root = document.documentElement;
  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return;
    }
    if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    }
  } catch (_error) {
  }
}

async function exitFullscreenMode() {
  if (!isFullscreenActive()) {
    return;
  }

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch (_error) {
  }
}

function clearExecutionTimers() {
  for (const timeoutId of executionSceneTimeouts) {
    clearTimeout(timeoutId);
  }
  executionSceneTimeouts = [];
}

function registerExecutionTimeout(callback, delayMs) {
  const timeoutId = window.setTimeout(() => {
    callback();
    executionSceneTimeouts = executionSceneTimeouts.filter((id) => id !== timeoutId);
  }, delayMs);
  executionSceneTimeouts.push(timeoutId);
}

function clearExecutionScene() {
  clearExecutionTimers();
  stopSinkCollapseAnimations();
  stopFlowRandomizer();
  executionComplete = false;
  resultScreen?.classList.remove("execution-fullscreen");
  if (!resultOutput) {
    return;
  }
  resultOutput.classList.remove(
    "execution-mode",
    "execution-annotate-active",
    "execution-float-active",
    "execution-fragments-active",
    "execution-flow-randomized",
    "execution-sink-collapse",
    "execution-sink",
    "execution-flow",
    "execution-pull",
    "execution-settle"
  );
  resultOutput.style.removeProperty("--vortex-speed");
  resultOutput.style.removeProperty("--vortex-drift-speed");
  resultOutput.style.removeProperty("--vortex-entry-speed");
  resultOutput.innerHTML = "";
}

function stopSinkCollapseAnimations() {
  for (const motion of sinkTokenAnimations) {
    try {
      motion.cancel();
    } catch (_error) {
    }
  }
  sinkTokenAnimations = [];
}

function stopFlowRandomizer() {
  if (flowRandomizerTimer) {
    clearInterval(flowRandomizerTimer);
    flowRandomizerTimer = null;
  }

  for (const timerId of flowTokenTimers) {
    clearTimeout(timerId);
  }
  flowTokenTimers = [];

  for (const motion of flowTokenAnimations) {
    try {
      motion.cancel();
    } catch (_error) {
    }
  }
  flowTokenAnimations = [];
}

function startSinkCollapse(tokenNodes) {
  stopSinkCollapseAnimations();

  if (!Array.isArray(tokenNodes) || !tokenNodes.length || !resultOutput) {
    return;
  }

  const flowSpeed = Math.min(2.2, Math.max(0.45, Number(VORTEX_MOTION.speed) || 1));
  const collapseSlowdown = 1.42;

  tokenNodes.forEach((token, index) => {
    if (!token?.isConnected) {
      return;
    }

    const collapseX = Number.parseFloat(token.style.getPropertyValue("--sink-collapse-x")) || 0;
    const collapseY = Number.parseFloat(token.style.getPropertyValue("--sink-collapse-y")) || 0;
    const collapseRot = Number.parseFloat(token.style.getPropertyValue("--sink-collapse-rot")) || 0;
    const collapseScale = Math.max(0.28, Number.parseFloat(token.style.getPropertyValue("--sink-collapse-scale")) || 0.4);
    const sinkDepth = Math.max(34, Number.parseFloat(token.style.getPropertyValue("--sink-depth")) || (42 + Math.random() * 36));
    const overshootX = collapseX * (0.38 + Math.random() * 0.2) + (Math.random() - 0.5) * 5;
    const overshootY = collapseY * (0.34 + Math.random() * 0.22) - (6 + Math.random() * 11);
    const rimDriftX = collapseX * (0.86 + Math.random() * 0.2) + (Math.random() - 0.5) * 3;
    const rimDriftY = collapseY * (0.8 + Math.random() * 0.2) + (Math.random() - 0.5) * 4;
    const plungeX = collapseX * (1.03 + Math.random() * 0.12) + (Math.random() - 0.5) * 6;
    const plungeY = collapseY + sinkDepth * (0.56 + Math.random() * 0.22);
    const singularityX = collapseX * (1.1 + Math.random() * 0.14) + (Math.random() - 0.5) * 9;
    const singularityY = collapseY + sinkDepth * (1.02 + Math.random() * 0.36);
    const spinA = (Math.random() - 0.5) * 6.5;
    const spinB = (Math.random() - 0.5) * 8.2;
    const spinC = (Math.random() - 0.5) * 14.5;
    const duration = ((1180 + Math.random() * 980) * collapseSlowdown) / flowSpeed;
    const delay = ((Math.random() * 420 + index * 4.8) * 1.08) / flowSpeed;
    const finalScale = Math.max(0.14, collapseScale * (0.46 + Math.random() * 0.2));

    const motion = token.animate(
      [
        {
          transform: "translate(-50%, -50%) rotate(var(--sink-rot)) scale(var(--sink-scale, 0.82))",
          opacity: 0.9,
          filter: "blur(0.12px) grayscale(0.06)",
          offset: 0
        },
        {
          transform: `translate(calc(-50% + ${overshootX.toFixed(2)}px), calc(-50% + ${overshootY.toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${spinA.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * 0.96))`,
          opacity: 0.96,
          filter: "blur(0.08px) grayscale(0.02)",
          offset: 0.24
        },
        {
          transform: `translate(calc(-50% + ${rimDriftX.toFixed(2)}px), calc(-50% + ${rimDriftY.toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${spinB.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * 0.72))`,
          opacity: 0.58,
          filter: "blur(0.22px) grayscale(0.12)",
          offset: 0.58
        },
        {
          transform: `translate(calc(-50% + ${plungeX.toFixed(2)}px), calc(-50% + ${plungeY.toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${spinC.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * 0.44))`,
          opacity: 0.24,
          filter: "blur(0.46px) grayscale(0.2)",
          offset: 0.82
        },
        {
          transform: `translate(calc(-50% + ${singularityX.toFixed(2)}px), calc(-50% + ${singularityY.toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${collapseRot.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * ${finalScale.toFixed(3)}))`,
          opacity: 0.02,
          filter: "blur(0.9px) grayscale(0.32)",
          offset: 1
        }
      ],
      {
        duration,
        delay,
        easing: "cubic-bezier(0.14, 0.86, 0.16, 1)",
        fill: "forwards"
      }
    );

    sinkTokenAnimations.push(motion);
    motion.onfinish = () => {
      const motionIndex = sinkTokenAnimations.indexOf(motion);
      if (motionIndex >= 0) {
        sinkTokenAnimations.splice(motionIndex, 1);
      }
    };
  });
}

function startFlowRandomizer(tokenNodes) {
  stopFlowRandomizer();

  if (!Array.isArray(tokenNodes) || !tokenNodes.length) {
    return;
  }

  resultOutput?.classList.add("execution-flow-randomized");

  const scheduleTokenMotion = (token, waitMs = 0) => {
    if (!token || !token.isConnected) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (!token?.isConnected || !resultOutput?.classList.contains("execution-flow")) {
        return;
      }

      const driftAmp = 0.78 + Math.random() * 0.94;
      token.style.setProperty("--flow-x-a", `${((Math.random() - 0.5) * 20 * driftAmp).toFixed(2)}px`);
      token.style.setProperty("--flow-y-a", `${((Math.random() - 0.5) * 16 * driftAmp).toFixed(2)}px`);
      token.style.setProperty("--flow-x-b", `${((Math.random() - 0.5) * 18 * driftAmp).toFixed(2)}px`);
      token.style.setProperty("--flow-y-b", `${((Math.random() - 0.5) * 15 * driftAmp).toFixed(2)}px`);
      token.style.setProperty("--flow-rot-a", `${((Math.random() - 0.5) * 4.2).toFixed(2)}deg`);
      token.style.setProperty("--flow-rot-b", `${((Math.random() - 0.5) * 3.6).toFixed(2)}deg`);
      token.style.setProperty("--flow-duration", `${(9.8 + Math.random() * 7.8).toFixed(2)}s`);
      token.style.setProperty("--flow-delay", `${(Math.random() * 2.1).toFixed(2)}s`);
      token.style.setProperty("--flow-noise-x", `${((Math.random() - 0.5) * 16).toFixed(2)}px`);
      token.style.setProperty("--flow-noise-y", `${((Math.random() - 0.5) * 13).toFixed(2)}px`);
      token.style.setProperty("--flow-noise-rot", `${((Math.random() - 0.5) * 3.2).toFixed(2)}deg`);
      token.style.setProperty("--flow-noise-cycle", `${(2.3 + Math.random() * 5.1).toFixed(2)}s`);
      token.style.setProperty("--flow-noise-delay", `${(Math.random() * 2.9).toFixed(2)}s`);

      const travelA = (Math.random() - 0.5) * 18;
      const travelB = (Math.random() - 0.5) * 16;
      const travelC = (Math.random() - 0.5) * 12;
      const rotateA = (Math.random() - 0.5) * 4.2;
      const rotateB = (Math.random() - 0.5) * 3.6;
      const rotateC = (Math.random() - 0.5) * 3;
      const duration = 1950 + Math.random() * 2650;

      const motion = token.animate(
        [
          {
            transform: `translate(calc(-50% + ${travelA.toFixed(2)}px), calc(-50% + ${(travelB * 0.38).toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${rotateA.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * ${(0.96 + Math.random() * 0.06).toFixed(3)}))`,
            offset: 0
          },
          {
            transform: `translate(calc(-50% + ${(travelB * 0.72).toFixed(2)}px), calc(-50% + ${travelC.toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${rotateB.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * ${(0.94 + Math.random() * 0.08).toFixed(3)}))`,
            offset: 0.5
          },
          {
            transform: `translate(calc(-50% + ${travelC.toFixed(2)}px), calc(-50% + ${(travelA * 0.5).toFixed(2)}px)) rotate(calc(var(--sink-rot, 0deg) + ${rotateC.toFixed(2)}deg)) scale(calc(var(--sink-scale, 0.82) * ${(0.95 + Math.random() * 0.07).toFixed(3)}))`,
            offset: 1
          }
        ],
        {
          duration,
          easing: "cubic-bezier(0.24, 0.62, 0.28, 1)",
          fill: "forwards"
        }
      );

      flowTokenAnimations.push(motion);
      motion.onfinish = () => {
        const index = flowTokenAnimations.indexOf(motion);
        if (index >= 0) {
          flowTokenAnimations.splice(index, 1);
        }

        const nextGap = 110 + Math.random() * 420;
        scheduleTokenMotion(token, nextGap);
      };
    }, waitMs);

    flowTokenTimers.push(timerId);
  };

  tokenNodes.forEach((token, index) => {
    const startDelay = (index * 6 + Math.random() * 420);
    scheduleTokenMotion(token, startDelay);
  });
}

function normalizeSceneText(text, fallback, maxLength) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  const baseText = normalized || fallback;
  return baseText.length > maxLength ? `${baseText.slice(0, maxLength - 1)}…` : baseText;
}

const EXECUTION_TEMPLATE_WORDS = new Set([
  "quality",
  "clear",
  "efficient",
  "optimize",
  "optimized",
  "value",
  "communication",
  "effectively",
  "effective",
  "standardized",
  "improved",
  "effective",
  "positive",
  "stable",
  "consistent",
  "professional",
  "appropriate",
  "valuable",
  "supportive",
  "coherent",
  "readable",
  "normal",
  "safe"
]);

const EXECUTION_STOPWORDS = new Set([
  "to",
  "the",
  "and",
  "or",
  "a",
  "an",
  "of",
  "in",
  "for",
  "on",
  "with",
  "by",
  "is",
  "are",
  "be"
]);

function tokenizeExecutionText(text) {
  const source = String(text || "").toLowerCase();
  const english = source.match(/[a-z][a-z-]{2,}/g) || [];
  const chinese = String(text || "").match(/[\u4e00-\u9fff]{2,4}/g) || [];
  return [...english, ...chinese];
}

function extractTemplateWordsFromRewritten(rewrittenText) {
  const sceneText = normalizeSceneText(rewrittenText, "", 460);
  if (!sceneText) {
    return ["generated", "rewrite"];
  }

  const countMap = new Map();
  for (const token of tokenizeExecutionText(sceneText)) {
    if (!token || EXECUTION_STOPWORDS.has(token)) {
      continue;
    }
    countMap.set(token, (countMap.get(token) || 0) + 1);
  }

  const ranked = Array.from(countMap.entries())
    .map(([token, totalCount]) => {
      const blandBonus = EXECUTION_TEMPLATE_WORDS.has(token) ? 2 : 0;
      const shortPenalty = token.length <= 2 ? 0.6 : 0;
      const repeatBonus = totalCount >= 2 ? 2.4 : 0;
      return {
        token,
        score: totalCount + repeatBonus + blandBonus - shortPenalty
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked.slice(0, 12).map((item) => item.token);
  if (selected.length >= 6) {
    return selected;
  }

  const backupTokens = tokenizeExecutionText(sceneText)
    .filter((token) => token && !EXECUTION_STOPWORDS.has(token));

  for (const token of backupTokens) {
    if (!selected.includes(token)) {
      selected.push(token);
    }
    if (selected.length >= 8) {
      break;
    }
  }

  return selected.length ? selected : ["generated", "rewrite"];
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  const text = String(seedText || "");
  for (let i = 0; i < text.length; i += 1) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return function seededRandom() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extractRewriteSnippets(rewrittenText) {
  const source = String(rewrittenText || "");
  const sentenceParts = (source.match(/[^.!?;\n]+[.!?]?/g) || [])
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 16);

  const snippets = [];
  const danglingEnds = new Set([
    "by",
    "with",
    "for",
    "to",
    "of",
    "in",
    "on",
    "from",
    "into",
    "through",
    "about",
    "as",
    "than"
  ]);

  const cleanEnding = (snippetText) => {
    const normalized = String(snippetText || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }

    const words = normalized.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    if (!words.length) {
      return normalized;
    }

    let tail = words.length;
    while (tail > 4) {
      const lowered = words[tail - 1].toLowerCase();
      if (!danglingEnds.has(lowered)) {
        break;
      }
      tail -= 1;
    }

    const clipped = words.slice(0, tail).join(" ").trim();
    if (!clipped) {
      return normalized;
    }

    if (/[.!?]$/.test(normalized)) {
      return `${clipped}.`;
    }

    return clipped;
  };

  for (const sentence of sentenceParts) {
    const words = sentence.match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
    if (words.length < 2) {
      continue;
    }

    const clippedSentence = sentence.replace(/\s+/g, " ").trim();
    if (words.length >= 5) {
      snippets.push(cleanEnding(clippedSentence));
    } else {
      const take = Math.max(3, Math.min(8, words.length));
      snippets.push(cleanEnding(words.slice(0, take).join(" ")));
    }

    if (snippets.length >= 3) {
      break;
    }
  }

  if (snippets.length) {
    return snippets;
  }

  const words = source
    .match(/[A-Za-z][A-Za-z'-]{2,}/g);

  if (!words || !words.length) {
    return ["generated rewrite output"];
  }

  const fallbackSnippet = words.slice(0, Math.min(10, words.length)).join(" ");
  return [cleanEnding(fallbackSnippet)];
}

function buildExecutionTextDeck(variantTexts, rewrittenText) {
  const variants = Array.isArray(variantTexts) ? variantTexts.filter(Boolean) : [];
  const [step1 = "", step2 = "", step3 = ""] = variants;
  const fallback = String(rewrittenText || "").trim();

  return [
    `Correction\n${String(step1 || fallback).trim()}`,
    `optimization\n${String(step2 || fallback).trim()}`,
    `standardization\n${String(step3 || fallback).trim()}`
  ].join("\n\n").slice(0, 2200);
}

function buildOverlayFragments(variantTexts, rewrittenText) {
  const source = `${(variantTexts || []).join(" ")} ${String(rewrittenText || "")}`;
  const rawTokens = tokenizeExecutionText(source)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !EXECUTION_STOPWORDS.has(token));

  const unique = [];
  for (const token of rawTokens) {
    if (!unique.includes(token)) {
      unique.push(token);
    }
    if (unique.length >= 44) {
      break;
    }
  }

  const base = unique.length ? unique : extractTemplateWordsFromRewritten(rewrittenText);
  const expanded = [];
  const targetCount = Math.min(156, Math.max(92, base.length * 4));
  for (let i = 0; i < targetCount; i += 1) {
    expanded.push(base[i % base.length]);
  }

  return expanded;
}


function animateAnnotationBridge(textSheet, tokenNodes, bridgeLayer, seedText) {
  if (!textSheet || !Array.isArray(tokenNodes) || !tokenNodes.length || !bridgeLayer) {
    return;
  }

  const marks = Array.from(textSheet.querySelectorAll(".execution-mark"));
  if (!marks.length) {
    return;
  }

  bridgeLayer.innerHTML = "";
  const random = createSeededRandom(seedText);
  const bridgeRect = bridgeLayer.getBoundingClientRect();
  const svgNs = "http://www.w3.org/2000/svg";
  const threadSvg = document.createElementNS(svgNs, "svg");
  threadSvg.setAttribute("class", "execution-bridge-thread-svg");
  threadSvg.setAttribute("viewBox", `0 0 ${Math.max(1, bridgeRect.width)} ${Math.max(1, bridgeRect.height)}`);
  threadSvg.setAttribute("preserveAspectRatio", "none");
  bridgeLayer.appendChild(threadSvg);

  const tokenPool = tokenNodes.map((node) => ({
    node,
    text: String(node.dataset.word || node.querySelector(".execution-token-text")?.textContent || "").toLowerCase()
  }));

  const usedTokenIndex = new Set();
  let activeThreadCount = 0;

  marks.forEach((mark, index) => {
    const sourceRect = mark.getBoundingClientRect();
    const sourceX = sourceRect.left - bridgeRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top - bridgeRect.top + sourceRect.height / 2;
    const markText = String(mark.textContent || "").toLowerCase();

    let targetIndex = tokenPool.findIndex(
      (item, itemIndex) =>
        !usedTokenIndex.has(itemIndex) &&
        item.text &&
        (item.text.includes(markText) || markText.includes(item.text))
    );

    if (targetIndex < 0) {
      targetIndex = tokenPool.findIndex((_item, itemIndex) => !usedTokenIndex.has(itemIndex));
    }

    if (targetIndex < 0) {
      targetIndex = index % tokenPool.length;
    }

    usedTokenIndex.add(targetIndex);

    const targetRect = tokenPool[targetIndex].node.getBoundingClientRect();
    const targetX = targetRect.left - bridgeRect.left + targetRect.width / 2;
    const targetY = targetRect.top - bridgeRect.top + targetRect.height / 2;

    const ghost = document.createElement("span");
    ghost.className = "execution-bridge-word";
    const sourceText = String(mark.textContent || "").trim();
    ghost.textContent = sourceText;
    ghost.style.left = `${sourceX.toFixed(2)}px`;
    ghost.style.top = `${sourceY.toFixed(2)}px`;
    bridgeLayer.appendChild(ghost);

    const duration = 1680 + Math.floor(random() * 620);
    const delay = index * 36;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const travel = Math.max(40, Math.hypot(dx, dy));
    const normalX = dy / travel;
    const normalY = -dx / travel;
    const arcLift = Math.min(120, 28 + travel * 0.26 + random() * 32);
    const cx = sourceX + dx * 0.5 + normalX * arcLift;
    const cy = sourceY + dy * 0.5 + normalY * arcLift;

    const threadPath = document.createElementNS(svgNs, "path");
    threadPath.setAttribute("class", "execution-bridge-thread-path");
    threadPath.setAttribute("d", `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${targetX.toFixed(2)} ${targetY.toFixed(2)}`);
    threadSvg.appendChild(threadPath);

    const threadLength = Math.max(1, threadPath.getTotalLength());
    threadPath.style.strokeDasharray = `${threadLength.toFixed(2)}`;
    threadPath.style.strokeDashoffset = `${threadLength.toFixed(2)}`;
    activeThreadCount += 1;

    const keyframes = [];
    const steps = 12;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const inv = 1 - t;
      const px = inv * inv * sourceX + 2 * inv * t * cx + t * t * targetX;
      const py = inv * inv * sourceY + 2 * inv * t * cy + t * t * targetY;

      const progressEase = Math.pow(t, 0.92);
      const scale = 1 - progressEase * 0.16;
      const opacity = 0.94 - progressEase * 0.9;
      const blur = progressEase * 1.4;
      const white = Math.round(242 + (1 - t) * 8);
      const glowAlpha = 0.16 + (1 - t) * 0.16;

      keyframes.push({
        transform: `translate(calc(-50% + ${(px - sourceX).toFixed(2)}px), calc(-50% + ${(py - sourceY).toFixed(2)}px)) scale(${scale.toFixed(3)})`,
        opacity: Math.max(0.04, opacity),
        filter: `blur(${blur.toFixed(2)}px)`,
        color: `rgba(${white}, ${white}, ${white}, 0.96)`,
        textShadow: `0 0 6px rgba(238, 244, 240, ${glowAlpha.toFixed(3)})`,
        offset: t
      });
    }

    ghost.animate(keyframes, {
      duration,
      delay,
      easing: "cubic-bezier(0.2, 0.72, 0.2, 1)",
      fill: "forwards"
    }).onfinish = () => {
      ghost.remove();
    };

    const threadDuration = duration + 560;
    threadPath.animate([
      {
        strokeDashoffset: threadLength,
        opacity: 0
      },
      {
        strokeDashoffset: 0,
        opacity: 0.74,
        offset: 0.28
      },
      {
        strokeDashoffset: 0,
        opacity: 0.52,
        offset: 0.72
      },
      {
        strokeDashoffset: -threadLength * 0.24,
        opacity: 0
      }
    ], {
      duration: threadDuration,
      delay: Math.max(0, delay - 30),
      easing: "cubic-bezier(0.2, 0.62, 0.16, 1)",
      fill: "forwards"
    }).onfinish = () => {
      threadPath.remove();
      activeThreadCount -= 1;
      if (activeThreadCount <= 0) {
        threadSvg.remove();
      }
    };
  });
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAnnotatedExecutionHtml(textDeck, markerTokens) {
  const escapedDeck = escapeSvgText(String(textDeck || ""));
  const markers = Array.isArray(markerTokens)
    ? markerTokens
      .map((token) => String(token || "").trim())
      .filter((token) => token.length >= 3)
    : [];

  const uniqueMarkers = [];
  for (const marker of markers) {
    const lowered = marker.toLowerCase();
    if (!uniqueMarkers.some((item) => item.toLowerCase() === lowered)) {
      uniqueMarkers.push(marker);
    }
    if (uniqueMarkers.length >= 12) {
      break;
    }
  }

  if (!uniqueMarkers.length) {
    return escapedDeck;
  }

  const alternation = uniqueMarkers
    .sort((a, b) => b.length - a.length)
    .map((item) => escapeRegExp(escapeSvgText(item)))
    .join("|");

  const markerRegex = new RegExp(`(${alternation})`, "gi");
  return escapedDeck.replace(markerRegex, '<span class="execution-mark">$1</span>');
}

function randomizeExecutionMarks(textSheet) {
  if (!textSheet) {
    return;
  }

  const marks = Array.from(textSheet.querySelectorAll(".execution-mark"));
  marks.forEach((mark) => {
    const delay = Math.random() * 2.4;
    const cycle = 0.92 + Math.random() * 1.35;
    const glowAlpha = 0.24 + Math.random() * 0.34;
    const baseAlpha = 0.1 + Math.random() * 0.14;
    const brightScale = 1.02 + Math.random() * 0.28;

    mark.style.setProperty("--mark-delay", `${delay.toFixed(2)}s`);
    mark.style.setProperty("--mark-cycle", `${cycle.toFixed(2)}s`);
    mark.style.setProperty("--mark-glow-alpha", `${glowAlpha.toFixed(3)}`);
    mark.style.setProperty("--mark-base-alpha", `${baseAlpha.toFixed(3)}`);
    mark.style.setProperty("--mark-bright", `${brightScale.toFixed(3)}`);
  });
}

function highlightMarkedExecutionTokens(tokenNodes, markerTokens) {
  if (!Array.isArray(tokenNodes) || !tokenNodes.length) {
    return;
  }

  const normalizedMarkers = (Array.isArray(markerTokens) ? markerTokens : [])
    .map((token) => String(token || "").toLowerCase().trim())
    .filter(Boolean);

  if (!normalizedMarkers.length) {
    return;
  }

  tokenNodes.forEach((tokenNode) => {
    const word = String(tokenNode?.dataset?.word || "").toLowerCase().trim();
    if (!word) {
      return;
    }

    const matched = normalizedMarkers.some(
      (marker) => word === marker || word.includes(marker) || marker.includes(word)
    );

    if (!matched) {
      return;
    }

    tokenNode.classList.add("execution-token-marked");
    tokenNode.style.setProperty("--token-mark-delay", `${(Math.random() * 1.9).toFixed(2)}s`);
    tokenNode.style.setProperty("--token-mark-cycle", `${(1.05 + Math.random() * 1.65).toFixed(2)}s`);
    tokenNode.style.setProperty("--token-mark-glow", `${(0.24 + Math.random() * 0.42).toFixed(3)}`);
  });
}

function escapeSvgText(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createExecutionTokens(layer, words) {
  const layerRect = layer.getBoundingClientRect();
  const width = Math.max(320, Math.floor(layerRect.width) || 0);
  const height = Math.max(240, Math.floor(layerRect.height) || 0);
  const centerX = width / 2;
  const centerY = height / 2;

  // Keep the random shape coherent within one render by generating one parameter set per scene.
  const shapeArmCount = 9 + Math.floor(Math.random() * 5);
  const shapeSweepTurns = 4.6 + Math.random() * 2.4;
  const shapeEllipseRatio = 0.8 + Math.random() * 0.14;
  const shapeRadiusJitter = 4 + Math.random() * 6;
  const shapeSpiralExp = 1 + Math.random() * 0.34;
  const shapeCenterDriftX = (Math.random() - 0.5) * 4;
  const shapeCenterDriftY = (Math.random() - 0.5) * 3;
  const shapeArmTwist = (Math.random() - 0.5) * 0.24;
  const holeRadius = Math.max(44, Math.min(width, height) * 0.13);

  const createdTokens = [];

  words.forEach((word, index) => {
    const sourceWord = String(word || "").trim();
    if (!sourceWord) {
      return;
    }

    const token = document.createElement("div");
    token.className = "execution-token";
    const text = document.createElement("span");
    text.className = "execution-token-text";
    text.textContent = sourceWord;

    const ghost = document.createElement("span");
    ghost.className = "execution-token-ghost";
    ghost.textContent = sourceWord;

    token.dataset.word = sourceWord.toLowerCase();

    token.appendChild(ghost);
    token.appendChild(text);

    const angle = (index / Math.max(words.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.42;
    const radiusX = width * (0.2 + Math.random() * 0.18);
    const radiusY = height * (0.16 + Math.random() * 0.18);
    const baseX = centerX + Math.cos(angle) * radiusX;
    const baseY = centerY + Math.sin(angle) * radiusY;

    const armIndex = index % shapeArmCount;
    const laneIndex = Math.floor(index / shapeArmCount);
    const laneCount = Math.max(1, Math.ceil(words.length / shapeArmCount));
    const laneT = laneCount > 1 ? laneIndex / (laneCount - 1) : 0;
    const armBase = (armIndex / shapeArmCount) * Math.PI * 2;
    const sweep = laneT * Math.PI * 2 * shapeSweepTurns;
    const localTwist = shapeArmTwist * (1 - laneT * 0.45);
    const vortexAngle = armBase + sweep + localTwist + (Math.random() - 0.5) * 0.16;
    const maxRadius = Math.min(width, height) * 0.49;
    const spiralT = Math.pow(0.04 + laneT * 0.96, shapeSpiralExp);
    const vortexRadius = Math.max(16, maxRadius * (0.09 + spiralT * 0.94) + (Math.random() - 0.5) * shapeRadiusJitter);
    const vortexX = centerX + shapeCenterDriftX + Math.cos(vortexAngle) * vortexRadius;
    const vortexY = centerY + shapeCenterDriftY + Math.sin(vortexAngle) * (vortexRadius * shapeEllipseRatio);
    const vortexRot = ((vortexAngle * 180) / Math.PI + 90 + (Math.random() - 0.5) * 14).toFixed(2);

    const sinkAngle = vortexAngle + (Math.random() - 0.5) * 0.22;
    const sinkOrbitRadius = Math.max(
      holeRadius + 10 + laneT * 6,
      vortexRadius * (0.56 + laneT * 0.14)
    );
    const sinkX =
      centerX +
      shapeCenterDriftX * 0.35 +
      Math.cos(sinkAngle) * sinkOrbitRadius +
      (Math.random() - 0.5) * 4;
    const sinkY =
      centerY +
      shapeCenterDriftY * 0.35 +
      Math.sin(sinkAngle) * (sinkOrbitRadius * shapeEllipseRatio) +
      (Math.random() - 0.5) * 4;
    const sinkRot = ((Number(vortexRot.replace("deg", "")) + (Math.random() - 0.5) * 8)).toFixed(2);
    const sinkScale = (0.74 + (1 - laneT) * 0.18).toFixed(3);
    const sinkToCenterX = centerX - sinkX + (Math.random() - 0.5) * 6;
    const sinkToCenterY = centerY - sinkY + (Math.random() - 0.5) * 6;
    const sinkCollapseScale = (0.3 + laneT * 0.22 + Math.random() * 0.12).toFixed(3);
    const sinkCollapseRot = ((Math.random() - 0.5) * 28).toFixed(2);
    const sinkDepth = (36 + Math.random() * 68 + laneT * 26).toFixed(2);

    const mergeX = centerX + (Math.random() - 0.5) * 34;
    const mergeY = centerY + (Math.random() - 0.5) * 30;
    const stripWidth = Math.max(68, Math.min(width * 0.3, sourceWord.length * 23 + 40 + Math.random() * 26));
    const strandLength = Math.max(44, Math.min(height * 0.82, centerY - baseY + 62 + Math.random() * 46));

    token.style.left = `${Math.max(6, Math.min(width - stripWidth - 8, baseX - stripWidth / 2))}px`;
    token.style.top = `${Math.max(10, Math.min(height - 38, baseY))}px`;
    token.style.width = `${stripWidth}px`;
    token.style.height = "36px";
    token.style.setProperty("--merge-x", `${mergeX}px`);
    token.style.setProperty("--merge-y", `${mergeY}px`);
    token.style.setProperty("--vortex-x", `${vortexX.toFixed(2)}px`);
    token.style.setProperty("--vortex-y", `${vortexY.toFixed(2)}px`);
    token.style.setProperty("--vortex-rot", `${vortexRot}deg`);
    token.style.setProperty("--vortex-scale", `${(0.9 + (1 - laneT) * 0.18).toFixed(3)}`);
    token.style.setProperty("--sink-x", `${sinkX.toFixed(2)}px`);
    token.style.setProperty("--sink-y", `${sinkY.toFixed(2)}px`);
    token.style.setProperty("--sink-rot", `${sinkRot}deg`);
    token.style.setProperty("--sink-scale", `${sinkScale}`);
    token.style.setProperty("--token-delay", `${(index * 0.024).toFixed(2)}s`);
    token.style.setProperty("--token-rot", `${((Math.random() - 0.5) * 15).toFixed(2)}deg`);
    token.style.setProperty("--merge-rot", `${((Math.random() - 0.5) * 8).toFixed(2)}deg`);
    token.style.setProperty("--ghost-shift-x", `${(Math.random() - 0.5) * 3.2}px`);
    token.style.setProperty("--ghost-shift-y", `${(Math.random() - 0.5) * 2.4}px`);
    token.style.setProperty("--strand-len", `${strandLength.toFixed(2)}px`);
    token.style.setProperty("--flow-x-a", `${((Math.random() - 0.5) * 18).toFixed(2)}px`);
    token.style.setProperty("--flow-y-a", `${((Math.random() - 0.5) * 14).toFixed(2)}px`);
    token.style.setProperty("--flow-x-b", `${((Math.random() - 0.5) * 16).toFixed(2)}px`);
    token.style.setProperty("--flow-y-b", `${((Math.random() - 0.5) * 12).toFixed(2)}px`);
    token.style.setProperty("--flow-rot-a", `${((Math.random() - 0.5) * 3.4).toFixed(2)}deg`);
    token.style.setProperty("--flow-rot-b", `${((Math.random() - 0.5) * 2.8).toFixed(2)}deg`);
    token.style.setProperty("--flow-scale-a", `${(0.985 + Math.random() * 0.03).toFixed(3)}`);
    token.style.setProperty("--flow-scale-b", `${(0.98 + Math.random() * 0.035).toFixed(3)}`);
    token.style.setProperty("--flow-duration", `${(10.8 + Math.random() * 5.2).toFixed(2)}s`);
    token.style.setProperty("--flow-delay", `${(Math.random() * 1.6).toFixed(2)}s`);
    token.style.setProperty("--flow-noise-x", `${((Math.random() - 0.5) * 14).toFixed(2)}px`);
    token.style.setProperty("--flow-noise-y", `${((Math.random() - 0.5) * 11).toFixed(2)}px`);
    token.style.setProperty("--flow-noise-rot", `${((Math.random() - 0.5) * 2.2).toFixed(2)}deg`);
    token.style.setProperty("--flow-noise-cycle", `${(2.8 + Math.random() * 4.4).toFixed(2)}s`);
    token.style.setProperty("--flow-noise-delay", `${(Math.random() * 2.6).toFixed(2)}s`);
    token.style.setProperty("--sink-drop", `${(18 + Math.random() * 44).toFixed(2)}px`);
    token.style.setProperty("--sink-lift", `${(8 + Math.random() * 28).toFixed(2)}px`);
    token.style.setProperty("--sink-tilt", `${((Math.random() - 0.5) * 7).toFixed(2)}deg`);
    token.style.setProperty("--sink-cycle", `${(8.4 + Math.random() * 4.4).toFixed(2)}s`);
    token.style.setProperty("--sink-phase", `${(Math.random() * 2.3).toFixed(2)}s`);
    token.style.setProperty("--sink-collapse-x", `${sinkToCenterX.toFixed(2)}px`);
    token.style.setProperty("--sink-collapse-y", `${sinkToCenterY.toFixed(2)}px`);
    token.style.setProperty("--sink-collapse-scale", `${sinkCollapseScale}`);
    token.style.setProperty("--sink-collapse-rot", `${sinkCollapseRot}deg`);
    token.style.setProperty("--sink-depth", `${sinkDepth}px`);
    token.style.setProperty("--bend-amp", `${(2.8 + Math.random() * 4.6).toFixed(2)}deg`);
    token.style.setProperty("--bend-shift", `${((Math.random() - 0.5) * 4.8).toFixed(2)}px`);
    token.style.setProperty("--bend-cycle", `${(3.4 + Math.random() * 2.6).toFixed(2)}s`);
    token.style.setProperty("--bend-phase", `${(Math.random() * 2.1).toFixed(2)}s`);
    token.style.setProperty("--ripple-cycle", `${(4.8 + Math.random() * 2.8).toFixed(2)}s`);
    token.style.setProperty("--ripple-delay", `${(Math.random() * 2.4).toFixed(2)}s`);

    layer.appendChild(token);
    createdTokens.push(token);
  });

  return createdTokens;
}

function renderExecutionScene(sourceText, rewrittenText, variantTexts) {
  if (!resultOutput) {
    return;
  }

  clearExecutionScene();
  resultOutput.classList.add("execution-mode");
  resultScreen?.classList.add("execution-fullscreen");

  const motionSpeed = Math.min(2.2, Math.max(0.55, Number(VORTEX_MOTION.speed) || 1));
  const driftSpeed = Math.min(2.2, Math.max(0.45, Number(VORTEX_MOTION.driftSpeed) || 1));
  const firstSpinSpeed = Math.min(2.2, Math.max(0.4, Number(VORTEX_MOTION.firstSpinSpeed) || motionSpeed));
  const at = (ms) => Math.round(ms / motionSpeed);
  resultOutput.style.setProperty("--vortex-speed", String(motionSpeed));
  resultOutput.style.setProperty("--vortex-drift-speed", String(driftSpeed));
  resultOutput.style.setProperty("--vortex-entry-speed", String(firstSpinSpeed));

  const scene = document.createElement("div");
  scene.className = "execution-scene";

  const paper = document.createElement("div");
  paper.className = "execution-paper";

  const tokenLayer = document.createElement("div");
  tokenLayer.className = "execution-token-layer";

  const bridgeLayer = document.createElement("div");
  bridgeLayer.className = "execution-bridge-layer";

  const textSheet = document.createElement("pre");
  textSheet.className = "execution-text-sheet";

  const focusSentence = document.createElement("p");
  focusSentence.className = "execution-focus-sentence";

  const normalizedRewritten = normalizeSceneText(rewrittenText, "", 460);
  const templateWords = buildOverlayFragments(variantTexts, normalizedRewritten);
  const rewriteSnippets = extractRewriteSnippets(normalizedRewritten);
  const textDeck = buildExecutionTextDeck(variantTexts, normalizedRewritten);
  const markerTokens = templateWords.slice(0, 10);
  textSheet.innerHTML = buildAnnotatedExecutionHtml(textDeck, markerTokens);
  randomizeExecutionMarks(textSheet);
  focusSentence.textContent = rewriteSnippets[0] || normalizedRewritten;

  const cue = document.createElement("p");
  cue.className = "execution-cue";
  cue.textContent = rewriteSnippets[1] || rewriteSnippets[0] || "";

  paper.appendChild(cue);
  paper.appendChild(textSheet);
  paper.appendChild(focusSentence);
  paper.appendChild(tokenLayer);
  paper.appendChild(bridgeLayer);
  scene.appendChild(paper);

  resultOutput.appendChild(scene);

  // Token positions depend on real layer size, so mount first then generate.
  // Tokens must be created after mount because their positions rely on real DOM size.
  const tokenNodes = createExecutionTokens(tokenLayer, templateWords);
  highlightMarkedExecutionTokens(tokenNodes, markerTokens);

  registerExecutionTimeout(() => {
    resultOutput.classList.add("execution-annotate-active");
  }, at(1200));

  registerExecutionTimeout(() => {
    resultOutput.classList.add("execution-float-active");
  }, at(2700));

  registerExecutionTimeout(() => {
    animateAnnotationBridge(textSheet, tokenNodes, bridgeLayer, `${normalizedRewritten}::bridge`);
  }, at(3320));

  registerExecutionTimeout(() => {
    resultOutput.classList.add("execution-fragments-active");
  }, at(4700));

  registerExecutionTimeout(() => {
    resultOutput.classList.add("execution-pull");
  }, at(7600));

  registerExecutionTimeout(() => {
    resultOutput.classList.remove("execution-pull");
    resultOutput.classList.add("execution-sink");
  }, at(9800));

  registerExecutionTimeout(() => {
    resultOutput.classList.add("execution-sink-collapse");
    startSinkCollapse(tokenNodes);
  }, at(10150));

  registerExecutionTimeout(() => {
    resultOutput.classList.remove("execution-sink-collapse");
    resultOutput.classList.add("execution-settle");
  }, at(13250));

  registerExecutionTimeout(() => {
    stopSinkCollapseAnimations();
    resultOutput.classList.remove("execution-sink");
    resultOutput.classList.remove("execution-settle");
    resultOutput.classList.add("execution-flow");
    startFlowRandomizer(tokenNodes);
    if (statusText) {
      statusText.textContent = "Phase 7: Vortex keeps flowing continuously.";
    }
  }, at(14800));
}

function runExecutionVerdictTimeline(sourceText, rewrittenText, variantTexts) {
  // This timeline controls both visual phases and status text so they stay in sync.
  renderExecutionScene(sourceText, rewrittenText, variantTexts);
  const motionSpeed = Math.min(2.2, Math.max(0.55, Number(VORTEX_MOTION.speed) || 1));
  const at = (ms) => Math.round(ms / motionSpeed);

  if (statusText) {
    statusText.textContent = "Phase 1: Full generated text loaded..";
  }
  playPhaseTickSound(1);

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 2: Key phrases are annotated on text..";
    }
    playPhaseTickSound(2);
  }, at(1500));

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 3: Marked words drift upward before splitting..";
    }
    playPhaseTickSound(3);
  }, at(3300));

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 4: Floating words become fragment terms..";
    }
    playPhaseTickSound(4);
  }, at(4800));

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 5: Word strips align into vortex arms..";
    }
    playPhaseTickSound(5);
  }, at(7700));

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 6: The vortex sinks inward with the flow..";
    }
    playPhaseTickSound(6);
  }, at(9900));

  registerExecutionTimeout(() => {
    if (statusText) {
      statusText.textContent = "Phase 7: Continuous flowing vortex..";
    }
    playPhaseTickSound(7);
  }, at(14800));

  registerExecutionTimeout(() => {
    executionComplete = true;
    if (statusText) {
      statusText.textContent = "Click anywhere to return..";
      statusText.classList.add("click-hint-pulse");
    }
  }, at(18000));
}

async function requestRewriteText(text, signal) {
  // Single API gateway: normalize server errors here so callers stay simple.
  const response = await fetch(API_CONFIG.threeStepsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text }),
    signal
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        message = errorData.error;
      }
    } catch (_parseError) {
      // Keep fallback status message if error payload is not JSON.
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.step3) {
    throw new Error("No step3 text returned by API");
  }
  return {
    step1: String(data.step1 || "").trim(),
    step2: String(data.step2 || "").trim(),
    step3: String(data.step3 || "").trim(),
    skeleton: data.skeleton || null
  };
}

function setInputProgress(message, loading) {
  if (inputProgressBox) {
    inputProgressLabel.textContent = message;
    inputProgressBox.classList.toggle("loading", loading);
  }
}

function formatThreeStepsPreview(pipeline) {
  const step1 = String(pipeline?.step1 || "").trim() || "(empty)";
  const step2 = String(pipeline?.step2 || "").trim() || "(empty)";
  const step3 = String(pipeline?.step3 || "").trim() || "(empty)";

  return [
    "Correction",
    step1,
    "",
    "optimization",
    step2,
    "",
    "standardization",
    step3
  ].join("\n");
}

async function runRewrite(text, applyToInput) {
  // Request IDs prevent stale async responses from overwriting newer UI state.
  const requestId = liveRewriteRequestId + 1;
  liveRewriteRequestId = requestId;

  if (liveRewriteController) {
    liveRewriteController.abort();
  }
  liveRewriteController = new AbortController();

  setInputProgress("Rewriting live..", true);

  try {
    const pipeline = await requestRewriteText(text, liveRewriteController.signal);
    const rewritten = pipeline.step3;

    if (requestId !== liveRewriteRequestId) {
      return;
    }

    if (liveRewriteOutput) {
      renderPretext(liveRewriteOutput, formatThreeStepsPreview(pipeline));
    }

    if (applyToInput) {
      isApplyingRewrite = true;
      userInput.value = rewritten;
      isApplyingRewrite = false;
      lastInputText = rewritten;
    }

    setInputProgress("Live rewrite updated.", false);
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    const normalizedMessage = normalizeClientErrorMessage(error);

    if (liveRewriteOutput) {
      renderPretext(liveRewriteOutput, `Rewrite failed.\n${normalizedMessage}`);
    }

    setInputProgress(`Rewrite Failed: ${normalizedMessage}`, false);
  }
}

async function generateExecutionSceneFromApi(sourceText) {
  // This path drives the "full animation" experience on the result screen.
  if (executionSceneController) {
    executionSceneController.abort();
  }

  if (liveRewriteController) {
    liveRewriteController.abort();
  }

  executionSceneController = new AbortController();
  setInputProgress("Generating scene from three-step API..", true);

  if (generateBtn) {
    generateBtn.disabled = true;
  }

  try {
    const pipeline = await requestRewriteText(sourceText, executionSceneController.signal);
    const rewritten = pipeline.step3;
    const timelineVariants = [pipeline.step1, pipeline.step2, pipeline.step3].filter(Boolean);

    if (liveRewriteOutput) {
      renderPretext(liveRewriteOutput, formatThreeStepsPreview(pipeline));
    }

    isApplyingRewrite = true;
    userInput.value = rewritten;
    isApplyingRewrite = false;

    lastInputText = sourceText;
    setInputProgress("Scene data ready.", false);

    showResultScreen();
    clearExecutionScene();

    if (resultProgressBox) {
      resultProgressBox.classList.add("loading");
    }

    if (statusText) {
      statusText.textContent = "Rendering execution scene..";
    }

    runExecutionVerdictTimeline(sourceText, rewritten, timelineVariants);
    playUiSuccessSound();

    if (resultProgressBox) {
      resultProgressBox.classList.remove("loading");
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    const normalizedMessage = normalizeClientErrorMessage(error);

    setInputProgress(`Rewrite Failed: ${normalizedMessage}`, false);
    playUiErrorSound();

    if (statusText) {
      statusText.textContent = "Rewrite Failed.";
    }

    if (resultOutput && resultScreen.classList.contains("active")) {
      clearExecutionScene();
      renderPretext(resultOutput, `Rewrite failed.\n\n${normalizedMessage}`);
    }
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
    }

    if (resultProgressBox) {
      resultProgressBox.classList.remove("loading");
    }
  }
}

function scheduleLiveRewrite() {
  if (liveRewriteTimer) {
    clearTimeout(liveRewriteTimer);
  }

  const text = userInput.value.trim();
  if (!text) {
    renderPretext(liveRewriteOutput, "");
    setInputProgress("Awaiting Input..", false);
    return;
  }

  // Show immediate local echo so users always see feedback while API rewrite is in flight.
  renderPretext(liveRewriteOutput, text);
  setInputProgress("Rewriting live..", true);

  liveRewriteTimer = setTimeout(() => {
    runRewrite(text, false);
  }, 500);
}

// Primary action wiring: submit, regenerate, input debounce, and navigation.
generateBtn.addEventListener("click", async () => {
  playUiClickSound();
  const text = userInput.value.trim();
  if (!text) {
    playUiErrorSound();
    alert("Please enter text first.");
    return;
  }

  await generateExecutionSceneFromApi(text);
});

regenerateBtn.addEventListener("click", async () => {
  playUiClickSound();
  if (!lastInputText) {
    playUiErrorSound();
    alert("No previous input to regenerate.");
    return;
  }

  if (resultProgressBox) {
    resultProgressBox.classList.add("loading");
  }

  if (statusText) {
    statusText.textContent = "Regenerating from API..";
  }

  await generateExecutionSceneFromApi(lastInputText);
});

userInput.addEventListener("input", () => {
  if (isApplyingRewrite) {
    return;
  }
  scheduleLiveRewrite();
});

if (soundTestBtn) {
  soundTestBtn.addEventListener("click", () => {
    playTestSound();
  });
}

if (ambientToggleBtn) {
  ambientToggleBtn.addEventListener("click", () => {
    playUiClickSound();
    toggleAmbientBackground();
  });
}

const unlockAudioOnce = () => {
  if (soundUnlocked) {
    return;
  }
  const ctx = ensureAudioReady();
  if (!ctx) {
    return;
  }
  playUiClickSound();
  if (ambientEnabled) {
    startAmbientBackground();
  }
};

window.addEventListener("pointerdown", unlockAudioOnce, { passive: true });
window.addEventListener("keydown", unlockAudioOnce, { passive: true });

enterBtn.addEventListener("click", async () => {
  playUiClickSound();
  await requestFullscreenMode();
  showInputScreen();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    exitFullscreenMode();
  }
});

backBtn.addEventListener("click", () => {
  playUiClickSound();
  showInputScreen();
});

resultScreen.addEventListener("click", (event) => {
  if (!executionComplete) {
    return;
  }
  if (event.target.closest("button")) {
    return;
  }
  playUiClickSound();
  executionComplete = false;
  if (statusText) {
    statusText.classList.remove("click-hint-pulse");
  }
  showInputScreen();
});

showStartScreen();
renderPretext(startPretextOutput, START_SCREEN_PRETEXT);
renderPretext(liveRewriteOutput, "");
updateAmbientButtonLabel();
