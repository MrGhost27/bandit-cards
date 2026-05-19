// ================================================================
//  BANDIT CARDS — Settings & Preferences
// ================================================================

window.masterVolume = 1.0;

const SETTINGS_KEY = 'bandit_global_settings';

function loadSettings() {
    let settings = {
        theme: 'cyberpunk',
        volume: 100,
        largeCards: false,
        soundtrack: 'theme_default'
    };

    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        } else {
            // Migration from old bandit_theme key if it exists
            const oldTheme = localStorage.getItem('bandit_theme');
            if (oldTheme) settings.theme = oldTheme;
        }
    } catch (e) {
        console.warn("Failed to load settings", e);
    }

    // Apply to UI inputs
    const elTheme = document.getElementById('set-theme');
    const elVol = document.getElementById('set-volume');
    const elLarge = document.getElementById('set-large-cards');
    const elSoundtrack = document.getElementById('set-soundtrack');
    const elLblVol = document.getElementById('lbl-volume');

    if (elTheme) elTheme.value = settings.theme;
    if (elVol) elVol.value = settings.volume;
    if (elLarge) elLarge.checked = settings.largeCards;
    if (elSoundtrack) elSoundtrack.value = settings.soundtrack || 'theme_default';
    if (elLblVol) elLblVol.textContent = settings.volume + '%';

    // Apply global variables and styles
    window.masterVolume = settings.volume / 100;
    
    if (typeof applyTheme === 'function') {
        applyTheme(settings.theme);
    }
    
    if (settings.largeCards) {
        document.body.classList.add('large-cards');
    } else {
        document.body.classList.remove('large-cards');
    }
}

function updateSettings() {
    const theme = document.getElementById('set-theme').value;
    const volume = parseInt(document.getElementById('set-volume').value, 10);
    const largeCards = document.getElementById('set-large-cards').checked;
    const soundtrack = document.getElementById('set-soundtrack') ? document.getElementById('set-soundtrack').value : 'theme_default';

    document.getElementById('lbl-volume').textContent = volume + '%';

    // Update state immediately
    window.masterVolume = volume / 100;
    
    if (typeof applyTheme === 'function') {
        applyTheme(theme);
    }

    if (largeCards) {
        document.body.classList.add('large-cards');
    } else {
        document.body.classList.remove('large-cards');
    }

    // Save
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        theme, volume, largeCards, soundtrack
    }));
}

function showSettings() {
    loadSettings(); // Ensure UI is up to date before showing
    document.getElementById('scr-settings').classList.remove('hidden');
}

function hideSettings() {
    document.getElementById('scr-settings').classList.add('hidden');
}

// Automatically load on boot
window.addEventListener('DOMContentLoaded', loadSettings);
