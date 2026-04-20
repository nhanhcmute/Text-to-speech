/* ══════════════════════════════════════════════════
   TTS Studio – frontend logic
   ══════════════════════════════════════════════════ */

"use strict";

// ── State ────────────────────────────────────────────────────────────────────
let voices = [];          // full voice list from /api/voices
let currentAudioUrl = ""; // URL of the last generated audio

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initCharCounter();
  initRateSlider();
  loadVoices();

  // Ctrl+Enter shortcut to generate
  document.getElementById("text-input").addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") generateSpeech();
  });
});

// ── Voice loading ─────────────────────────────────────────────────────────────
async function loadVoices() {
  const langSel  = document.getElementById("lang-select");
  const voiceSel = document.getElementById("voice-select");

  try {
    const res  = await fetch("/api/voices");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    voices = data.voices;

    // Build unique locale → display-name map
    const localeMap = {};
    voices.forEach((v) => {
      if (!localeMap[v.locale]) localeMap[v.locale] = localeName(v.locale);
    });

    // Sort: Vietnamese first, then alphabetical
    const locales = Object.keys(localeMap).sort((a, b) => {
      if (a.startsWith("vi")) return -1;
      if (b.startsWith("vi")) return  1;
      return localeMap[a].localeCompare(localeMap[b]);
    });

    langSel.innerHTML = "";
    locales.forEach((loc) => {
      const opt = new Option(`${localeMap[loc]}  (${loc})`, loc);
      langSel.appendChild(opt);
    });

    // Default to Vietnamese if present
    const viLocale = locales.find((l) => l === "vi-VN") || locales[0];
    if (viLocale) langSel.value = viLocale;

    updateVoiceList();
  } catch (err) {
    langSel.innerHTML  = '<option value="">Lỗi tải danh sách</option>';
    voiceSel.innerHTML = '<option value="">—</option>';
    showStatus("error", `Không thể tải danh sách giọng đọc: ${err.message}`);
  }
}

// Rebuild voice dropdown when language changes
function onLanguageChange() {
  updateVoiceList();
}

function updateVoiceList() {
  const locale   = document.getElementById("lang-select").value;
  const voiceSel = document.getElementById("voice-select");

  const filtered = voices.filter((v) => v.locale === locale);

  voiceSel.innerHTML = "";
  if (!filtered.length) {
    voiceSel.innerHTML = '<option value="">Không có giọng đọc</option>';
    return;
  }

  filtered.forEach((v) => {
    const icon = v.gender === "Female" ? "♀" : "♂";
    voiceSel.appendChild(new Option(`${icon} ${v.display}`, v.name));
  });
}

// ── Character counter ─────────────────────────────────────────────────────────
function initCharCounter() {
  const ta      = document.getElementById("text-input");
  const current = document.getElementById("char-current");
  const wrapper = ta.parentElement.querySelector(".char-count");

  ta.addEventListener("input", () => {
    current.textContent = ta.value.length.toLocaleString("vi-VN");
  });
}

// ── Rate slider ───────────────────────────────────────────────────────────────
function initRateSlider() {
  const slider = document.getElementById("rate-slider");
  const badge  = document.getElementById("rate-badge");

  function update() {
    const v = parseInt(slider.value, 10);
    badge.textContent =
      v === 0 ? "Bình thường (0%)" :
      v > 0   ? `Nhanh hơn (+${v}%)` :
                `Chậm hơn (${v}%)`;

    // Update track fill colour
    const pct = ((v - (-50)) / (100 - (-50))) * 100;
    slider.style.background =
      `linear-gradient(to right, #6366f1 ${pct}%, #e2e8f0 ${pct}%)`;
  }

  slider.addEventListener("input", update);
  update(); // initial render
}

// ── Generate speech ───────────────────────────────────────────────────────────
async function generateSpeech() {
  const text  = document.getElementById("text-input").value.trim();
  const voice = document.getElementById("voice-select").value;
  const rate  = parseInt(document.getElementById("rate-slider").value, 10);

  // Client-side validation
  if (!text) {
    showStatus("error", "Vui lòng nhập văn bản trước khi tạo giọng nói.");
    document.getElementById("text-input").focus();
    return;
  }
  if (!voice) {
    showStatus("error", "Vui lòng chọn giọng đọc.");
    return;
  }

  // UI: enter loading state
  setLoading(true);
  hideAudio();
  showStatus("loading", "Đang tổng hợp giọng nói, vui lòng chờ…");

  try {
    const res = await fetch("/api/generate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text, voice, rate, volume: 0 }),
    });

    const data = await res.json();

    if (!res.ok || data.error) throw new Error(data.error || "Lỗi không xác định.");

    currentAudioUrl = data.audio_url;

    // Cache-bust so the browser doesn't serve a stale file
    const player = document.getElementById("audio-player");
    player.src = currentAudioUrl + "?t=" + Date.now();
    player.load();

    showAudio();

    const chunkInfo = data.chunks > 1
      ? ` · ${data.chars.toLocaleString("vi-VN")} ký tự · ${data.chunks} đoạn`
      : ` · ${data.chars.toLocaleString("vi-VN")} ký tự`;
    showStatus("success", `✓ Tạo thành công!${chunkInfo}`);

    // Attempt autoplay (may be blocked by browser policy)
    player.play().catch(() => {});
  } catch (err) {
    showStatus("error", `Lỗi: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadAudio() {
  if (!currentAudioUrl) return;
  const a = document.createElement("a");
  a.href     = currentAudioUrl;
  a.download = `tts_${Date.now()}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setLoading(active) {
  const btn   = document.getElementById("generate-btn");
  const label = document.getElementById("btn-label");
  const icon  = document.getElementById("btn-icon");

  btn.disabled = active;
  label.textContent = active ? "Đang tạo…" : "Tạo giọng nói";
  icon.innerHTML    = active
    ? '<span class="spinner"></span>'
    : "▶";
}

function showStatus(type, message) {
  const el = document.getElementById("status");
  el.className = `status status--${type}`;
  el.textContent = message;
}

function hideAudio() {
  document.getElementById("audio-section").classList.add("audio-section--hidden");
}

function showAudio() {
  document.getElementById("audio-section").classList.remove("audio-section--hidden");
}

// ── Locale → friendly name map ────────────────────────────────────────────────
function localeName(locale) {
  const map = {
    "vi-VN": "Tiếng Việt",
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "en-AU": "English (Australia)",
    "en-CA": "English (Canada)",
    "en-IN": "English (India)",
    "zh-CN": "中文 (简体)",
    "zh-TW": "中文 (繁體)",
    "zh-HK": "中文 (香港)",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
    "fr-FR": "Français (France)",
    "fr-CA": "Français (Canada)",
    "de-DE": "Deutsch",
    "es-ES": "Español (España)",
    "es-MX": "Español (México)",
    "it-IT": "Italiano",
    "pt-BR": "Português (Brasil)",
    "pt-PT": "Português (Portugal)",
    "ru-RU": "Русский",
    "ar-SA": "العربية",
    "hi-IN": "हिन्दी",
    "th-TH": "ภาษาไทย",
    "id-ID": "Bahasa Indonesia",
    "ms-MY": "Bahasa Melayu",
    "nl-NL": "Nederlands",
    "pl-PL": "Polski",
    "sv-SE": "Svenska",
    "tr-TR": "Türkçe",
    "uk-UA": "Українська",
  };
  return map[locale] || locale;
}
