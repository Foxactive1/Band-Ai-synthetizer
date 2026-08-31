/**
 * Bandmate AI Pro - Motor de Áudio + Groq AI
 * Prompt -> /api/generate -> Groq -> JSON musical -> Web Audio API
 * A GROQ_API_KEY nunca é enviada ao navegador.
 */

const CONFIG = { tempo: 120, key: "C Major", isPlaying: false, isRecording: false, nextNoteTime: 0, scheduleAheadTime: 0.12, beatCount: 0, aiArrangement: null };

const SCALES = {
    "C Major": [0, 2, 4, 5, 7, 9, 11],
    "G Major": [7, 9, 11, 0, 2, 4, 6],
    "D Minor": [2, 3, 5, 7, 9, 10, 0],
    "A Minor": [9, 10, 0, 2, 4, 5, 7],
    "Raga Yaman": [0, 2, 4, 6, 7, 9, 11],
    "Pentatonic": [0, 2, 4, 7, 9]
};

const INSTRUMENTS = {
    piano: { name: "Piano Elétrico", type: "fm", baseNote: 60, pattern: [0, -1, 4, -1, 7, -1, 4, -1], color: "#f59e0b" },
    bass: { name: "Baixo Sintetizado", type: "sub", baseNote: 36, pattern: [0, -1, -1, -1, 5, -1, -1, 7], color: "#10b981" },
    drums: { name: "Bateria Digital", type: "drum", baseNote: 36, pattern: [0, -1, 2, -1, 0, -1, 2, 1], color: "#ef4444" },
    sitar: { name: "Sitar Virtual", type: "am", baseNote: 64, pattern: [0, 2, 4, 7, 9, 7, 4, 2], color: "#8b5cf6" },
    synth: { name: "Pad Analógico", type: "pad", baseNote: 57, pattern: [0, 0, 7, 7, 4, 4, 11, 11], color: "#06b6d4" }
};

let audioCtx, masterGain, analyser, compressor, reverbNode, mediaRecorder, recordedChunks = [];

document.addEventListener("DOMContentLoaded", () => { setupUI(); initAudioContext(); });

function initAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) { setStatus("Seu navegador não suporta Web Audio API."); return; }
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain(); masterGain.gain.value = 0.8;
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 12;
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.82;

        const delay = audioCtx.createDelay(1); delay.delayTime.value = 0.3;
        const feedback = audioCtx.createGain(); feedback.gain.value = 0.35;
        const wetGain = audioCtx.createGain(); wetGain.gain.value = 0.18;

        masterGain.connect(compressor); compressor.connect(analyser); analyser.connect(audioCtx.destination);
        masterGain.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wetGain); wetGain.connect(audioCtx.destination);
        reverbNode = { delay, feedback, wetGain };
        startVisualizer();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
}

function safeTime(time) { return Math.max(time, audioCtx.currentTime + 0.001); }

class SoundEngine {
    static playTone(freq, type, duration, vol = 0.3, time = audioCtx.currentTime) {
        const now = safeTime(time), osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = type === "sub" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);
        const attack = Math.min(0.04, duration * 0.25), release = Math.max(0.05, duration * 0.75), peak = Math.max(0.001, vol);
        gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(peak, now + attack); gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
        osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now + duration + 0.05);
    }

    static playDrum(type, vol = 0.7, time = audioCtx.currentTime) {
        const now = safeTime(time);
        if (type === 0) {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = "sine"; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
            gain.gain.setValueAtTime(Math.max(0.001, vol), now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now + 0.4); return;
        }
        const bufferSize = Math.floor(audioCtx.sampleRate * 0.25), buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const source = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain(); source.buffer = buffer;
        if (type === 1) { filter.type = "bandpass"; filter.frequency.value = 1800; filter.Q.value = 0.7; gain.gain.setValueAtTime(vol * 0.75, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18); }
        else { filter.type = "highpass"; filter.frequency.value = 5000; gain.gain.setValueAtTime(vol * 0.35, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06); }
        source.connect(filter); filter.connect(gain); gain.connect(masterGain); source.start(now); source.stop(now + 0.25);
    }

    static playPad(freq, duration, vol = 0.18, time = audioCtx.currentTime) {
        const now = safeTime(time), osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
        osc1.type = "sawtooth"; osc2.type = "sawtooth"; osc1.frequency.setValueAtTime(freq, now); osc2.frequency.setValueAtTime(freq, now); osc2.detune.setValueAtTime(7, now);
        filter.type = "lowpass"; filter.frequency.setValueAtTime(900, now); filter.Q.value = 0.7;
        gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.5, duration * 0.35)); gain.gain.linearRampToValueAtTime(0.0001, now + duration);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(masterGain);
        osc1.start(now); osc2.start(now); osc1.stop(now + duration + 0.05); osc2.stop(now + duration + 0.05);
    }
}

function nextNote() {
    CONFIG.nextNoteTime += 60 / CONFIG.tempo;
    CONFIG.beatCount = (CONFIG.beatCount + 1) % 8;
}

function scheduleNote(beatNumber, time) {
    document.querySelectorAll(".instrument-card").forEach(card => {
        if (card.dataset.muted === "true") return;
        const type = card.dataset.type, inst = INSTRUMENTS[type]; if (!inst) return;
        const noteVal = (inst.pattern || [])[beatNumber]; if (noteVal === undefined || noteVal === null || noteVal < 0) return;
        const volume = Math.max(0, Math.min(100, Number(card.dataset.volume || 70))) / 100;
        if (type === "drums") { SoundEngine.playDrum(noteVal, volume, time); return; }
        const scale = SCALES[CONFIG.key] || SCALES["C Major"], semitone = scale[noteVal % scale.length], octave = Math.floor(noteVal / scale.length);
        const midiNote = inst.baseNote + semitone + octave * 12, freq = 440 * Math.pow(2, (midiNote - 69) / 12), duration = 60 / CONFIG.tempo;
        if (type === "synth") SoundEngine.playPad(freq, duration * 2, 0.22 * volume, time);
        else SoundEngine.playTone(freq, inst.type, duration, 0.32 * volume, time);
    });
}

function scheduler() {
    if (!CONFIG.isPlaying || !audioCtx) return;
    while (CONFIG.nextNoteTime < audioCtx.currentTime + CONFIG.scheduleAheadTime) { scheduleNote(CONFIG.beatCount, CONFIG.nextNoteTime); nextNote(); }
    requestAnimationFrame(scheduler);
}

function setupUI() {
    document.getElementById("play-btn")?.addEventListener("click", togglePlay);
    document.getElementById("stop-btn")?.addEventListener("click", stopAll);
    document.getElementById("record-btn")?.addEventListener("click", toggleRecord);
    document.getElementById("tempo-slider")?.addEventListener("input", e => { CONFIG.tempo = Number(e.target.value); updateTempoDisplay(); });
    document.getElementById("key-select")?.addEventListener("change", e => { CONFIG.key = e.target.value; });
    document.querySelectorAll("[data-inst]").forEach(button => button.addEventListener("click", () => addInstrument(button.dataset.inst)));
    document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => loadPreset(button.dataset.preset)));
    document.getElementById("generate-ai-btn")?.addEventListener("click", generateWithAI);
    const keyInput = document.getElementById("groq-key");
    if (keyInput) { keyInput.value = "Chave protegida pelo Vercel"; keyInput.disabled = true; keyInput.title = "A GROQ_API_KEY é mantida no servidor e não é exposta ao navegador."; }
    updateTempoDisplay();
}

function updateTempoDisplay() {
    const display = document.getElementById("tempo-display"), slider = document.getElementById("tempo-slider");
    if (display) display.textContent = CONFIG.tempo; if (slider) slider.value = CONFIG.tempo;
}

function setStatus(message) { const status = document.getElementById("status-text"); if (status) status.textContent = message; }

function addInstrument(type, options = {}) {
    if (!INSTRUMENTS[type] || document.querySelector(`[data-type="${type}"]`)) return;
    const container = document.getElementById("instruments-list"); if (!container) return;
    container.querySelector(".empty-state")?.remove();
    const inst = INSTRUMENTS[type];
    if (Array.isArray(options.pattern) && options.pattern.length === 8) inst.pattern = options.pattern.map(v => Number(v));
    const volume = Math.max(0, Math.min(100, Number(options.volume ?? 70)));
    const card = document.createElement("div"); card.className = "instrument-card"; card.dataset.type = type; card.dataset.muted = "false"; card.dataset.volume = String(volume); card.style.borderLeftColor = inst.color;
    card.innerHTML = `<div class="inst-header"><strong>${escapeHtml(inst.name)}</strong><div class="inst-controls"><button type="button" class="mute-btn"><i class="fas fa-volume-up"></i></button><button type="button" class="remove-btn"><i class="fas fa-trash"></i></button></div></div><input type="range" class="volume-slider" min="0" max="100" value="${volume}">`;
    card.querySelector(".mute-btn").addEventListener("click", e => toggleMute(e.currentTarget));
    card.querySelector(".remove-btn").addEventListener("click", e => removeInstrument(e.currentTarget));
    card.querySelector(".volume-slider").addEventListener("input", e => { card.dataset.volume = e.target.value; });
    container.appendChild(card);
}

function removeInstrument(button) {
    button.closest(".instrument-card")?.remove();
    if (!document.querySelector(".instrument-card")) document.getElementById("instruments-list").innerHTML = `<div class="empty-state"><i class="fas fa-sliders-h"></i><p>Nenhum instrumento ativo. Adicione abaixo ou use a IA.</p></div>`;
}

function toggleMute(button) {
    const card = button.closest(".instrument-card"); if (!card) return;
    const muted = card.dataset.muted === "true"; card.dataset.muted = String(!muted);
    button.innerHTML = muted ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>'; button.classList.toggle("active", !muted);
}

function clearInstruments() { const container = document.getElementById("instruments-list"); if (container) container.innerHTML = ""; }

function togglePlay() {
    initAudioContext(); if (!audioCtx) return;
    CONFIG.isPlaying = !CONFIG.isPlaying; const button = document.getElementById("play-btn");
    if (CONFIG.isPlaying) { CONFIG.nextNoteTime = audioCtx.currentTime + 0.08; CONFIG.beatCount = 0; scheduler(); setStatus("Tocando"); if (button) { button.innerHTML = '<i class="fas fa-pause"></i> Pausar'; button.classList.add("active"); } }
    else { setStatus("Pausado"); if (button) { button.innerHTML = '<i class="fas fa-play"></i> Tocar'; button.classList.remove("active"); } }
}

function stopAll() { CONFIG.isPlaying = false; CONFIG.beatCount = 0; const button = document.getElementById("play-btn"); if (button) { button.innerHTML = '<i class="fas fa-play"></i> Tocar'; button.classList.remove("active"); } setStatus("Pronto para tocar"); }

async function generateWithAI() {
    const input = document.getElementById("prompt-input"), button = document.getElementById("generate-ai-btn"), prompt = input?.value.trim() || "";
    if (!prompt) { setStatus("Digite uma ideia musical primeiro."); input?.focus(); return; }
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compondo...'; }
    setStatus("A IA está interpretando sua música...");
    try {
        const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Falha ao gerar composição.");
        if (!payload.music) throw new Error("A API não retornou uma composição válida.");
        applyAIComposition(payload.music); setStatus(`IA: ${payload.music.description || "Composição pronta"}`);
    } catch (error) { console.error("Bandmate AI:", error); setStatus(`Erro: ${error.message}`); alert(`Bandmate AI\n\n${error.message}`); }
    finally { if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-magic"></i> Gerar com IA'; } }
}

function applyAIComposition(music) {
    stopAll(); clearInstruments();
    if (Number.isInteger(music.tempo)) CONFIG.tempo = Math.max(60, Math.min(180, music.tempo));
    if (SCALES[music.key]) { CONFIG.key = music.key; const select = document.getElementById("key-select"); if (select) select.value = music.key; }
    updateTempoDisplay(); CONFIG.aiArrangement = music;
    const seen = new Set();
    (music.instruments || []).forEach(item => {
        if (!INSTRUMENTS[item.name] || seen.has(item.name)) return;
        seen.add(item.name);
        const pattern = Array.isArray(item.pattern) && item.pattern.length === 8 ? item.pattern.map(v => Math.max(-1, Math.min(11, Number(v)))) : INSTRUMENTS[item.name].pattern;
        addInstrument(item.name, { volume: Number(item.volume ?? 70), pattern });
    });
    if (!seen.size) { addInstrument("piano"); addInstrument("bass"); }
    togglePlay();
}

function loadPreset(name) {
    stopAll(); clearInstruments();
    const presets = {
        lofi: { tempo: 85, key: "A Minor", instruments: ["piano", "drums"] },
        rock: { tempo: 135, key: "A Minor", instruments: ["bass", "drums", "synth"] },
        meditation: { tempo: 70, key: "Raga Yaman", instruments: ["sitar", "synth"] },
        synthwave: { tempo: 110, key: "D Minor", instruments: ["bass", "drums", "synth"] }
    };
    const preset = presets[name]; if (!preset) return;
    CONFIG.tempo = preset.tempo; CONFIG.key = preset.key;
    const select = document.getElementById("key-select"); if (select) select.value = CONFIG.key;
    updateTempoDisplay(); preset.instruments.forEach(type => addInstrument(type)); setStatus(`Preset carregado: ${name}`);
}

function toggleRecord() {
    initAudioContext(); if (!audioCtx) return;
    if (!CONFIG.isRecording) {
        try {
            const destination = audioCtx.createMediaStreamDestination(); masterGain.connect(destination);
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            mediaRecorder = new MediaRecorder(destination.stream, { mimeType }); recordedChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => { const blob = new Blob(recordedChunks, { type: "audio/webm" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `bandmate-recording-${Date.now()}.webm`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
            mediaRecorder.start(); CONFIG.isRecording = true; const button = document.getElementById("record-btn"); button?.classList.add("recording"); if (button) button.innerHTML = '<i class="fas fa-stop"></i> Parar Grav.'; setStatus("Gravando");
        } catch (error) { console.error(error); setStatus("Não foi possível iniciar a gravação."); }
    } else {
        mediaRecorder?.stop(); CONFIG.isRecording = false; const button = document.getElementById("record-btn"); button?.classList.remove("recording"); if (button) button.innerHTML = '<i class="fas fa-circle"></i> Gravar'; setStatus("Gravação finalizada");
    }
}

function startVisualizer() {
    const canvas = document.getElementById("audio-visualizer"); if (!canvas || !analyser) return;
    const context = canvas.getContext("2d"), data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
        requestAnimationFrame(draw); const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        analyser.getByteFrequencyData(data); context.clearRect(0, 0, width, height);
        const bars = 64, step = Math.max(1, Math.floor(data.length / bars)), barWidth = width / bars;
        for (let i = 0; i < bars; i++) { const value = data[i * step] / 255, barHeight = value * height * 0.9; context.fillStyle = `hsl(${190 + i * 2}, 85%, 60%)`; context.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight); }
    };
    draw();
}

function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
