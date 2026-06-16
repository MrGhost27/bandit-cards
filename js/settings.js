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
        soundtrack: 'theme_default',
        displayMode: 'auto',
        resolutionScale: 100,
        deckStyle: 'standard'
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
    const elDisplay = document.getElementById('set-display-mode');
    const elScale = document.getElementById('set-scale');
    const elDeckStyle = document.getElementById('set-deck-style');
    const elLblVol = document.getElementById('lbl-volume');
    const elLblScale = document.getElementById('lbl-scale');

    if (elTheme) elTheme.value = settings.theme;
    if (elVol) elVol.value = settings.volume;
    if (elLarge) elLarge.checked = settings.largeCards;
    if (elSoundtrack) elSoundtrack.value = settings.soundtrack || 'theme_default';
    if (elDisplay) elDisplay.value = settings.displayMode || 'auto';
    if (elScale) elScale.value = settings.resolutionScale || 100;
    if (elDeckStyle) elDeckStyle.value = settings.deckStyle || 'standard';
    if (elLblVol) elLblVol.textContent = settings.volume + '%';
    if (elLblScale) elLblScale.textContent = (settings.resolutionScale || 100) + '%';

    // Apply global variables and styles
    window.masterVolume = settings.volume / 100;
    window.globalSettings = settings;
    
    if (typeof applyTheme === 'function') {
        applyTheme(settings.theme);
    }
    
    if (settings.largeCards) {
        document.body.classList.add('large-cards');
    } else {
        document.body.classList.remove('large-cards');
    }

    document.body.classList.remove('deck-frozen', 'deck-groovy');
    if (settings.deckStyle && settings.deckStyle !== 'standard') {
        document.body.classList.add('deck-' + settings.deckStyle);
    }
}

function updateSettings() {
    const theme = document.getElementById('set-theme').value;
    const volume = parseInt(document.getElementById('set-volume').value, 10);
    const largeCards = document.getElementById('set-large-cards').checked;
    const soundtrack = document.getElementById('set-soundtrack') ? document.getElementById('set-soundtrack').value : 'theme_default';
    const displayMode = document.getElementById('set-display-mode') ? document.getElementById('set-display-mode').value : 'auto';
    const resolutionScale = parseInt(document.getElementById('set-scale') ? document.getElementById('set-scale').value : '100', 10);
    const deckStyle = document.getElementById('set-deck-style') ? document.getElementById('set-deck-style').value : 'standard';

    document.getElementById('lbl-volume').textContent = volume + '%';
    if (document.getElementById('lbl-scale')) document.getElementById('lbl-scale').textContent = resolutionScale + '%';

    // Update state immediately
    window.masterVolume = volume / 100;
    window.globalSettings = { theme, volume, largeCards, soundtrack, displayMode, resolutionScale, deckStyle };
    
    if (typeof applyTheme === 'function') {
        applyTheme(theme);
    }

    if (largeCards) {
        document.body.classList.add('large-cards');
    } else {
        document.body.classList.remove('large-cards');
    }

    document.body.classList.remove('deck-frozen', 'deck-groovy');
    if (deckStyle !== 'standard') {
        document.body.classList.add('deck-' + deckStyle);
    }

    if (typeof enforceScreenFit === 'function') {
        enforceScreenFit();
    }

    // Save
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(window.globalSettings));
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
