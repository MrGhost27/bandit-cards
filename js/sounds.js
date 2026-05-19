// ================================================================
//  BANDIT CARDS — Web Audio Sound Engine
// ================================================================

let audioCtx;
try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
} catch (e) {
    console.warn("AudioContext not supported/allowed in this environment.");
}

let bgmNode = null;
let bgmGain = null;

let bgmAudioEl = null;
let bgmMediaSource = null;

/**
 * Updates the background music based on the active theme and user settings.
 */
function updateBgm(theme) {
    if (!audioCtx) return;
    
    // Stop old oscillator bgm
    if (bgmNode) { bgmNode.stop(); bgmNode = null; }
    
    // Stop old HTML Audio bgm
    if (bgmAudioEl) {
        bgmAudioEl.pause();
        bgmAudioEl.src = '';
    }

    bgmGain = bgmGain || audioCtx.createGain();
    bgmGain.connect(audioCtx.destination);
    
    const settingsStr = localStorage.getItem('bandit_global_settings');
    const settings = settingsStr ? JSON.parse(settingsStr) : {};
    const customTrack = settings.soundtrack;

    const trackToPlay = customTrack && customTrack !== 'theme_default' ? customTrack : getThemeDefaultTrack(theme);

    if (trackToPlay && trackToPlay.endsWith('.mp3')) {
        playAudioFile(trackToPlay);
    } else {
        playSyntheticBgm(theme);
    }
}

function getThemeDefaultTrack(theme) {
    // Both alien themes default to the user's mp3 if they placed one
    if (theme === 'aliens' || theme === 'aliens-toon') return 'alien_soundtrack.mp3';
    return null; // fallback to synthetic
}

function playAudioFile(filename) {
    if (!bgmAudioEl) {
        bgmAudioEl = new Audio();
        bgmAudioEl.loop = true;
        try {
            bgmMediaSource = audioCtx.createMediaElementSource(bgmAudioEl);
            bgmMediaSource.connect(bgmGain);
        } catch (e) {
            console.warn("Could not connect audio element to Web Audio API:", e);
        }
    }
    
    // Fade in
    bgmGain.gain.setValueAtTime(0, audioCtx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0.3 * (window.masterVolume ?? 1.0), audioCtx.currentTime + 2);
    
    bgmAudioEl.src = 'assets/audio/' + filename;
    bgmAudioEl.play().catch(e => console.log("Audio play blocked. User must interact with document first.", e));
}

function playSyntheticBgm(theme) {
    bgmGain.gain.setValueAtTime(0.02 * (window.masterVolume ?? 1.0), audioCtx.currentTime);
    const now = audioCtx.currentTime;

    if (theme === 'mgs') {
        bgmNode = audioCtx.createOscillator();
        bgmNode.type = 'sine';
        bgmNode.frequency.setValueAtTime(50, now);
        bgmNode.connect(bgmGain);
        bgmNode.start();
    } else if (theme === 'jim') {
        playJimBassLoop();
    } else {
        // Generic drone for cyberpunk, aliens, whiteout, etc.
        bgmNode = audioCtx.createOscillator();
        bgmNode.type = 'triangle';
        bgmNode.frequency.setValueAtTime(45, now);
        bgmNode.connect(bgmGain);
        bgmNode.start();
    }
}


function playJimBassLoop() {
    if (!audioCtx || bgmNode) return;
    const now = audioCtx.currentTime;
    // Simple 4-note loop using a sequence of oscillators
    const notes = [110, 165, 110, 196]; // A2, E3, A2, G3
    let time = now;
    
    function playNote(freq, start) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const mv = window.masterVolume ?? 1.0;
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.05 * mv, start);
        g.gain.exponentialRampToValueAtTime(0.001 * mv, start + 0.5);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
    }

    // Since we want a loop, we'll just use a recursive timeout for simplicity in this demo
    let i = 0;
    const interval = setInterval(() => {
        const theme = localStorage.getItem('bandit_theme');
        if (theme !== 'jim') { clearInterval(interval); return; }
        playNote(notes[i % notes.length], audioCtx.currentTime);
        i++;
    }, 500);
    bgmNode = { stop: () => clearInterval(interval) };
}

/**
 * Plays a short synthetic sound.
 * @param {string} type - 'blip', 'zip', 'bust', 'ding', 'glitch', 'alert'
 */
function sfx(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const theme = localStorage.getItem('bandit_theme') || 'cyberpunk';
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'alert': {
            const mv = window.masterVolume ?? 1.0;
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.setValueAtTime(1500, now + 0.1);
            gain.gain.setValueAtTime(0.1 * mv, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * mv, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;
        }

        case 'blip': {
            const mv = window.masterVolume ?? 1.0;
            osc.type = theme === 'jim' ? 'triangle' : 'square';
            osc.frequency.setValueAtTime(theme === 'mgs' ? 400 : 800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.1 * mv, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * mv, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        }

        case 'zip': { // Card Deal
            const mv = window.masterVolume ?? 1.0;
            osc.type = theme === 'jim' ? 'sine' : 'sawtooth';
            if (theme === 'jim') {
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(1800, now + 0.2);
            } else {
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
            }
            gain.gain.setValueAtTime(0.05 * mv, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * mv, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        }

        case 'bust': {
            const mv = window.masterVolume ?? 1.0;
            if (theme === 'mgs') sfx('alert');
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.4);
            gain.gain.setValueAtTime(0.2 * mv, now);
            gain.gain.linearRampToValueAtTime(0.01 * mv, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;
        }

        case 'ding': { // Stay / Win
            const mv = window.masterVolume ?? 1.0;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
            gain.gain.setValueAtTime(0.1 * mv, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * mv, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;
        }

        case 'glitch': { // Action card
            const mv = window.masterVolume ?? 1.0;
            osc.type = 'square';
            osc.frequency.setValueAtTime(Math.random() * 1000 + 500, now);
            osc.frequency.setValueAtTime(Math.random() * 1000 + 500, now + 0.05);
            osc.frequency.setValueAtTime(Math.random() * 1000 + 500, now + 0.1);
            gain.gain.setValueAtTime(0.05 * mv, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * mv, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        }
    }
}

