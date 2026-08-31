/**
 * Bandmate AI Pro - Motor de Áudio Avançado
 * Inclui: Visualizador, Gravação, Efeitos Globais e Síntese Premium
 */

// --- Configurações Globais ---
const CONFIG = {
    tempo: 120,
    key: "C Major",
    isPlaying: false,
    isRecording: false,
    nextNoteTime: 0.0,
    lookahead: 25.0, // ms
    scheduleAheadTime: 0.1, // s
    beatCount: 0
};

// --- Escalas Musicais ---
const SCALES = {
    "C Major": [0, 2, 4, 5, 7, 9, 11],
    "G Major": [7, 9, 11, 0, 2, 4, 6],
    "D Minor": [2, 3, 5, 7, 9, 10, 0],
    "A Minor": [9, 10, 0, 2, 4, 5, 7],
    "Raga Yaman": [0, 2, 4, 6, 7, 9, 11],
    "Pentatonic": [0, 2, 4, 7, 9]
};

// --- Definição dos Instrumentos ---
const INSTRUMENTS = {
    piano: { name: "Piano Elétrico", type: "fm", baseNote: 60, pattern: [0, null, 4, null, 7, null, 4, null], color: "#f59e0b" },
    bass: { name: "Baixo Sintetizado", type: "sub", baseNote: 36, pattern: [0, null, null, null, 5, null, null, 7], color: "#10b981" },
    drums: { name: "Bateria Digital", type: "drum", baseNote: 36, pattern: [0, null, 2, null, 0, null, 2, 1], color: "#ef4444" }, // 0: Kick, 1: Snare, 2: HiHat
    sitar: { name: "Sitar Virtual", type: "am", baseNote: 64, pattern: [0, 2, 4, 7, 9, 7, 4, 2], color: "#8b5cf6" },
    synth: { name: "Pad Analógico", type: "pad", baseNote: 57, pattern: [0, 0, 7, 7, 4, 4, 11, 11], color: "#06b6d4" }
};

// --- Variáveis de Áudio ---
let audioCtx;
let masterGain;
let analyser;
let compressor;
let reverbNode;
let mediaRecorder;
let recordedChunks = [];

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    initAudioContext();
});

function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        // Cadeia de Efeitos Globais
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.8;

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;

        // Reverb Simulado (Convolver seria melhor, mas vamos usar um delay curto para eco)
        const delay = audioCtx.createDelay();
        delay.delayTime.value = 0.3;
        const feedback = audioCtx.createGain();
        feedback.gain.value = 0.4;
        const wetGain = audioCtx.createGain();
        wetGain.gain.value = 0.3;

        // Roteamento: Master -> Compressor -> Analyser -> Destino
        // E também Master -> Delay -> Feedback -> Delay (Loop) -> WetGain -> Destino
        masterGain.connect(compressor);
        compressor.connect(analyser);
        analyser.connect(audioCtx.destination);

        // Envio para efeito de eco
        masterGain.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(audioCtx.destination);

        reverbNode = { delay, feedback, wetGain }; // Armazena para controle futuro se necessário

        startVisualizer();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- Síntese de Som ---
class SoundEngine {
    static playTone(freq, type, duration, vol = 0.5) {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = type === 'sub' ? 'triangle' : 'sine';
        osc.frequency.value = freq;

        // Envelope ADSR simples
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.05); // Attack
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // Release

        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + duration + 0.1);
    }

    static playDrum(type) {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        if (type === 0) { // Kick
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
            gain.gain.setValueAtTime(1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        } else if (type === 1) { // Snare (Ruído simulado com oscilador de alta freq modulada)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100, now);
            gain.gain.setValueAtTime(0.7, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        } else { // HiHat
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now); // Metálico
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        }

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    static playPad(freq, duration) {
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        
        osc1.frequency.value = freq;
        osc2.frequency.value = freq + 2; // Detune para efeito chorus

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 1); // Attack lento
        gain.gain.linearRampToValueAtTime(0, now + duration); 

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration);
        osc2.stop(now + duration);
    }
}

// --- Agendador de Notas (Scheduler) ---
function nextNote() {
    const secondsPerBeat = 60.0 / CONFIG.tempo;
    CONFIG.nextNoteTime += secondsPerBeat; // Avança para o próximo beat
    CONFIG.beatCount = (CONFIG.beatCount + 1) % 8; // Ciclo de 8 beats
}

function scheduleNote(beatNumber, time) {
    // Itera sobre instrumentos ativos na UI
    document.querySelectorAll('.instrument-card').forEach(card => {
        if (card.dataset.muted === "true") return;

        const type = card.dataset.type;
        const instConfig = INSTRUMENTS[type];
        const pattern = instConfig.pattern;
        const noteVal = pattern[beatNumber];

        if (noteVal !== null && noteVal !== undefined) {
            const scale = SCALES[CONFIG.key];
            const semitone = scale[noteVal % scale.length];
            const octave = Math.floor(noteVal / scale.length);
            const midiNote = instConfig.baseNote + semitone + (octave * 12);
            const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

            // Dispara o som baseado no tipo
            if (type === 'drums') {
                SoundEngine.playDrum(noteVal);
            } else if (type === 'synth') {
                SoundEngine.playPad(freq, 60/CONFIG.tempo * 2);
            } else {
                SoundEngine.playTone(freq, instConfig.type, 60/CONFIG.tempo, 0.3);
            }
        }
    });
}

function scheduler() {
    while (CONFIG.nextNoteTime < audioCtx.currentTime + CONFIG.scheduleAheadTime) {
        scheduleNote(CONFIG.beatCount, CONFIG.nextNoteTime);
        nextNote();
    }
    if (CONFIG.isPlaying) {
        requestAnimationFrame(scheduler);
    }
}

// --- Controle da UI ---
function setupUI() {
    // Play/Stop
    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('stop-btn').addEventListener('click', stopAll);
    
    // Record
    document.getElementById('record-btn').addEventListener('click', toggleRecord);

    // Tempo
    const tempoSlider = document.getElementById('tempo-slider');
    tempoSlider.addEventListener('input', (e) => {
        CONFIG.tempo = parseInt(e.target.value);
        document.getElementById('tempo-display').textContent = CONFIG.tempo;
    });

    // Key
    document.getElementById('key-select').addEventListener('change', (e) => {
        CONFIG.key = e.target.value;
    });

    // Adicionar Instrumentos
    document.querySelectorAll('[data-inst]').forEach(btn => {
        btn.addEventListener('click', () => addInstrument(btn.dataset.inst));
    });

    // Presets
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
    });

    // IA (Simulada para demo)
    document.getElementById('generate-ai-btn').addEventListener('click', () => {
        const prompt = document.getElementById('prompt-input').value.toLowerCase();
        let instToAdd = [];
        if (prompt.includes('jazz')) instToAdd.push('piano', 'bass');
        if (prompt.includes('rock')) instToAdd.push('drums', 'bass');
        if (prompt.includes('india') || prompt.includes('sitar')) instToAdd.push('sitar');
        if (prompt.includes('eletronic') || prompt.includes('synth')) instToAdd.push('synth');
        
        if (instToAdd.length > 0) {
            clearInstruments();
            instToAdd.forEach(i => addInstrument(i));
            if (!CONFIG.isPlaying) togglePlay();
        } else {
            alert("Tente palavras-chave como: jazz, rock, india, synth");
        }
    });
}

function addInstrument(type) {
    if (document.querySelector(`[data-type="${type}"]`)) return; // Já existe

    const container = document.getElementById('instruments-list');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const inst = INSTRUMENTS[type];
    const div = document.createElement('div');
    div.className = 'instrument-card';
    div.dataset.type = type;
    div.dataset.muted = "false";
    div.style.borderLeftColor = inst.color;
    
    div.innerHTML = `
        <div class="inst-header">
            <strong>${inst.name}</strong>
            <div class="inst-controls">
                <button onclick="toggleMute(this)"><i class="fas fa-volume-up"></i></button>
                <button onclick="removeInstrument(this)"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <input type="range" class="volume-slider" min="0" max="100" value="70">
    `;
    container.appendChild(div);
}

function removeInstrument(btn) {
    const card = btn.closest('.instrument-card');
    card.remove();
    if (document.querySelectorAll('.instrument-card').length === 0) {
        document.getElementById('instruments-list').innerHTML = `
            <div class="empty-state"><i class="fas fa-sliders-h"></i><p>Nenhum instrumento ativo.</p></div>`;
    }
}

function toggleMute(btn) {
    const card = btn.closest('.instrument-card');
    const isMuted = card.dataset.muted === "true";
    card.dataset.muted = !isMuted;
    btn.innerHTML = !isMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    btn.classList.toggle('active', !isMuted);
}

function clearInstruments() {
    document.getElementById('instruments-list').innerHTML = '';
}

function togglePlay() {
    initAudioContext();
    CONFIG.isPlaying = !CONFIG.isPlaying;
    const btn = document.getElementById('play-btn');
    
    if (CONFIG.isPlaying) {
        CONFIG.nextNoteTime = audioCtx.currentTime + 0.1;
        scheduler();
        btn.innerHTML = '<i class="fas fa-pause"></i> Pausar';
        btn.classList.add('active');
    } else {
        btn.innerHTML = '<i class="fas fa-play"></i> Tocar';
        btn.classList.remove('active');
    }
}

function stopAll() {
    CONFIG.isPlaying = false;
    document.getElementById('play-btn').innerHTML = '<i class="fas fa-play"></i> Tocar';
    document.getElementById('play-btn').classList.remove('active');
}

// --- Gravação ---
function toggleRecord() {
    if (!CONFIG.isRecording) {
        // Iniciar Gravação
        const dest = audioCtx.createMediaStreamDestination();
        masterGain.connect(dest);
        mediaRecorder = new MediaRecorder(dest.stream);
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bandmate-recording-${Date.now()}.webm`;
            a.click();
        };

        mediaRecorder.start();
        CONFIG.isRecording = true;
        document.getElementById('record-btn').classList.add('recording');
        document.getElementById('record-btn').innerHTML = '<i class="fas fa-stop"></i> Parar Grav.';
    } else {
        // Parar Gravação
        mediaRecorder.stop();
        CONFIG.isRecording = false;
        document.getElementById('record-btn').classList.remove('recording');
        document.getElementById('record-btn').innerHTML = '<i class="fas fa-circle"></i> Gravar';
    }
}

// --- Presets ---
function loadPreset(name) {
    clearInstruments();
    stopAll();
    
    switch(name) {
        case 'lofi':
            CONFIG.tempo = 85;
            addInstrument('piano');
            addInstrument('drums');
            break;
        case 'rock':
            CONFIG.tempo = 120;
            addInstrument('drums');
            addInstrument('bass');
            break;
        case 'meditation':
            CONFIG.tempo = 60;
            addInstrument('sitar');
            addInstrument('synth');
            break;
        case 'synthwave':
            CONFIG.tempo = 110;
            addInstrument('synth');
            addInstrument('drums');
            break;
    }
    
    document.getElementById('tempo-slider').value = CONFIG.tempo;
    document.getElementById('tempo-display').textContent = CONFIG.tempo;
}

// --- Visualizador ---
function startVisualizer() {
    const canvas = document.getElementById('audio-visualizer');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        requestAnimationFrame(draw);
        
        // Ajustar tamanho do canvas
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        analyser.getByteTimeDomainData(dataArray);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#22d3ee';
        ctx.beginPath();

        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;

        for(let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;

            if(i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }
    draw();
}
