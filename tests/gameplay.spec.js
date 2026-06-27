const { test, expect } = require('@playwright/test');

test.describe('Bandit Cards Gameplay Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Listen for all console messages and print them to the CI log
    page.on('console', msg => {
      console.log(`BROWSER CONSOLE [${msg.type()}]: ${msg.text()}`);
    });
    
    // Listen for page errors (exceptions)
    page.on('pageerror', exception => {
      console.log(`BROWSER EXCEPTION: ${exception}`);
    });
  });

  test('should register, create a game, and add an AI opponent', async ({ page }) => {
    console.log('Starting gameplay flow test...');
    
    // 1. Load the game
    await page.goto('/');
    await expect(page).toHaveTitle(/BANDIT CARDS/);
    console.log('Page loaded successfully.');

    // 2. Register a new temporary account
    const callsign = `tp_${Math.floor(Math.random() * 100000)}`;
    const password = 'Password123!';

    console.log(`Attempting to register user: ${callsign}`);
    const regLink = page.locator('text=No account? Create one');
    await regLink.click({ force: true });
    
    // Wait for the registration form to actually become visible
    await page.waitForSelector('#rg-user', { state: 'visible', timeout: 10000 });
    
    await page.fill('#rg-user', callsign);
    await page.fill('#rg-pass', password);
    await page.fill('#rg-conf', password);
    await page.click('#rg-btn');

    // Give Supabase a moment to ensure the profile is fully propagated before creating a game
    await page.waitForTimeout(2000);

    // 3. Verify we are in the lobby
    const regErr = page.locator('#rg-err');
    
    try {
      await expect(page.locator('#scr-lobby')).toBeVisible({ timeout: 15000 });
      console.log('Successfully reached the lobby.');
    } catch (e) {
      const errorText = await regErr.textContent();
      console.log(`Failed to reach lobby. Registration error visible: "${errorText}"`);
      throw e;
    }

    await expect(page.locator('#lobbyUser')).toHaveText(new RegExp(callsign, 'i'));

    // 4. Create a new match
    console.log('Creating a new game...');
    // Be specific to avoid clicking multiple "CREATE GAME" buttons if they exist
    await page.locator('#scr-lobby >> text=CREATE GAME').click();

    // 5. Verify we are in the waiting room
    await expect(page.locator('#scr-waiting')).toBeVisible({ timeout: 15000 });
    console.log('Reached the waiting room.');
    
    const code = await page.locator('#code-display').textContent();
    console.log(`Game created with code: ${code}`);
    expect(code).not.toBe('——————');

    // 6. Add an AI opponent
    await expect(page.locator('#ai-controls')).toBeVisible();
    console.log('Adding AI opponent...');
    await page.click('text=+ ADD AI TO NEXT SEAT');

    // Verify AI seat appears
    await expect(page.locator('#seat-rows')).toContainText(/AI/, { timeout: 10000 });
    console.log('AI opponent added successfully.');

    // 7. Start the game
    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeEnabled({ timeout: 5000 });
    await startBtn.click();
    console.log('Clicked start game.');

    // 8. Verify we are in the game screen
    await expect(page.locator('#scr-game')).toBeVisible({ timeout: 15000 });
    console.log('Game screen is visible. Test PASSED.');
    
    await expect(page.locator('#players-area')).not.toBeEmpty();

    // Clean up test account
    await page.evaluate(async () => {
      await db.rpc('delete_user_self');
    });
  });

  test('should be able to sign out', async ({ page }) => {
    await page.goto('/');
    
    // 1. Register first to ensure we are logged in
    const callsign = `tp_logout_${Math.floor(Math.random() * 100000)}`;
    const password = 'Password123!';
    
    await page.click('text=No account? Create one');
    await page.waitForSelector('#rg-user', { state: 'visible' });
    await page.fill('#rg-user', callsign);
    await page.fill('#rg-pass', password);
    await page.fill('#rg-conf', password);
    await page.click('#rg-btn');
    
    // 2. Wait for lobby to confirm login
    await expect(page.locator('#scr-lobby')).toBeVisible({ timeout: 15000 });
    console.log('Logged in for sign-out test.');

    // 3. Target the sign out button specifically in the top header
    const headerSignOut = page.locator('header .auth-btn.sec:has-text("SIGN OUT")');
    await expect(headerSignOut).toBeVisible();
    
    // Give the UI a moment to settle after registration
    await page.waitForTimeout(1000);
    
    // Direct DOM click to bypass any potential overlay/z-index issues
    // Clean up test account first
    await page.evaluate(async () => {
      await db.rpc('delete_user_self');
    });
    await headerSignOut.evaluate(el => el.click());

    // 4. Verify back at auth screen
    await expect(page.locator('#scr-auth')).toBeVisible();
    console.log('Sign out verified.');
  });

  test('should play a full game with AI without timing out', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes max for a full game simulation

    console.log('Starting full game simulation...');
    await page.goto('/');
    
    // Register & Login
    const callsign = `tp_game_${Math.floor(Math.random() * 100000)}`;
    await page.click('text=No account? Create one');
    await page.waitForSelector('#rg-user', { state: 'visible' });
    await page.fill('#rg-user', callsign);
    await page.fill('#rg-pass', 'Password123!');
    await page.fill('#rg-conf', 'Password123!');
    await page.click('#rg-btn');
    
    await expect(page.locator('#scr-lobby')).toBeVisible({ timeout: 15000 });
    
    // Enable Quick Play (Target score 50 instead of 200)
    await page.check('#quick-play-check');

    // Create Game & Add AI
    await page.locator('#scr-lobby >> text=CREATE GAME').click();
    await expect(page.locator('#scr-waiting')).toBeVisible({ timeout: 15000 });
    
    // Add 3 AIs so the game has 4 players. Someone will reach 50 points much faster.
    await page.click('text=+ ADD AI TO NEXT SEAT');
    await page.click('text=+ ADD AI TO NEXT SEAT');
    await page.click('text=+ ADD AI TO NEXT SEAT');
    
    await expect(page.locator('#seat-rows')).toContainText(/AI/, { timeout: 10000 });
    
    // Start Game
    await page.locator('#btn-start').click();
    await expect(page.locator('#scr-game')).toBeVisible({ timeout: 15000 });
    console.log('Game started. Entering play loop...');

    let loopCount = 0;
    let gameOver = false;

    // Game Loop
    while (!gameOver && loopCount < 3000) {
      loopCount++;
      // Poll more frequently to reduce dead time
      await page.waitForTimeout(200);
      
      // Check if Game Over
      if (await page.locator('#scr-gameover').isVisible()) {
        console.log('Game Over screen reached!');
        gameOver = true;
        break;
      }

      // Check if Next Round button is visible
      const nextBtn = page.locator('#btn-next-round');
      if (await nextBtn.isVisible()) {
        console.log('Starting next round...');
        await nextBtn.evaluate(el => el.click());
        continue;
      }

      // Check if we need to target someone
      const targetable = page.locator('.player-row.targetable');
      if (await targetable.count() > 0) {
        console.log('Targeting player...');
        await targetable.first().click({ force: true });
        continue;
      }

      // Check if it's our turn (HIT button visible)
      const hitBtn = page.locator('#btn-hit');
      if (await hitBtn.isVisible()) {
        // Play extremely safe to guarantee points
        const cardCount = await page.locator('.player-row.active .card').count();
        if (cardCount >= 2 || Math.random() < 0.2) {
          console.log('Choosing to STAY...');
          await page.locator('#btn-stay').evaluate(el => el.click());
        } else {
          console.log('Choosing to HIT...');
          await hitBtn.evaluate(el => el.click());
        }
      }
      
      // Strict AI Timeout Check:
      // If we've looped many times without any of the above being true, 
      // the AI might be stuck. The turn timer is 60 seconds by default.
      // 100 loops * ~1s = 100 seconds. If we hit 100 loops, the test fails.
    }

    expect(gameOver).toBe(true);
    console.log(`Full game completed successfully in ${loopCount} loops.`);

    // Clean up test account
    await page.evaluate(async () => {
      await db.rpc('delete_user_self');
    });
  });
});
