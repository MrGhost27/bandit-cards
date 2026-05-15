// ================================================================
//  BANDIT CARDS — Theme & Navigation Logic
// ================================================================

const THEMES = ['cyberpunk', 'whiteout', 'bebop', 'mgs', 'jim'];

function toggleTheme() {
    let current = localStorage.getItem('bandit_theme') || 'cyberpunk';
    let idx = THEMES.indexOf(current);
    let next = THEMES[(idx + 1) % THEMES.length];
    
    applyTheme(next);
}

function applyTheme(theme) {
    document.body.classList.remove(...THEMES.map(t => 'theme-' + t));
    if (theme !== 'cyberpunk') {
        document.body.classList.add('theme-' + theme);
    }
    localStorage.setItem('bandit_theme', theme);
    
    // UI Tweaks for themes
    const logo = document.querySelector('.logo');
    if (theme === 'bebop') logo.innerHTML = 'SPACE<em>COWBOY</em>';
    else if (theme === 'mgs') logo.innerHTML = 'TACTICAL<em>CODEC</em>';
    else if (theme === 'jim') logo.innerHTML = 'GROOVY<em>!</em>';
    else logo.innerHTML = 'BANDIT<em>CARDS</em>';

    // Update BGM
    if (typeof updateBgm === 'function') updateBgm(theme);
}

function initTheme() {
    const saved = localStorage.getItem('bandit_theme') || 'cyberpunk';
    applyTheme(saved);
}

function returnToLobby() {
    // If we're in a game, we don't necessarily leave the DB row, 
    // but we return the UI to the lobby screen.
    showScreen('scr-lobby');
    renderWaiting(); // Refresh lobby state
}

// Initialize on load
initTheme();
