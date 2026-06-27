-- ═══════════════════════════════════════════════════════════
-- BANDIT CARDS — Supabase Table Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ═══════════════════════════════════════════════════════════

-- 1. Games table
CREATE TABLE IF NOT EXISTS bandit_games (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    join_code       text NOT NULL UNIQUE,
    status          text NOT NULL DEFAULT 'waiting',
    host_id         uuid REFERENCES profiles(id),
    max_players     integer NOT NULL DEFAULT 4,
    target_score    integer NOT NULL DEFAULT 200,
    quick_play      boolean NOT NULL DEFAULT false,
    turn_timer_secs integer DEFAULT NULL,
    current_round   integer NOT NULL DEFAULT 0,
    active_seat     integer DEFAULT NULL,
    turn_deadline   timestamptz DEFAULT NULL,
    deck_state      jsonb NOT NULL DEFAULT '[]'::jsonb,
    discard_pile    jsonb NOT NULL DEFAULT '[]'::jsonb,
    round_state     jsonb NOT NULL DEFAULT '{}'::jsonb,
    settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- 2. Players table (one row per seat)
CREATE TABLE IF NOT EXISTS bandit_players (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid REFERENCES bandit_games(id) ON DELETE CASCADE,
    profile_id      uuid REFERENCES profiles(id),
    seat_number     integer NOT NULL,
    display_name    text NOT NULL,
    is_ai           boolean NOT NULL DEFAULT false,
    ai_difficulty   integer DEFAULT 3,
    ai_personality  text DEFAULT NULL,
    total_score     integer NOT NULL DEFAULT 0,
    hand            jsonb NOT NULL DEFAULT '[]'::jsonb,
    status          text NOT NULL DEFAULT 'waiting',
    round_score     integer DEFAULT 0,
    is_connected    boolean NOT NULL DEFAULT true,
    last_seen       timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now(),
    UNIQUE(game_id, seat_number)
);

-- 3. Spectators table
CREATE TABLE IF NOT EXISTS bandit_spectators (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid REFERENCES bandit_games(id) ON DELETE CASCADE,
    profile_id      uuid REFERENCES profiles(id),
    stats_enabled   boolean NOT NULL DEFAULT true,
    joined_at       timestamptz DEFAULT now(),
    UNIQUE(game_id, profile_id)
);

-- 4. Round history table
CREATE TABLE IF NOT EXISTS bandit_round_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid REFERENCES bandit_games(id) ON DELETE CASCADE,
    round_number    integer NOT NULL,
    results         jsonb NOT NULL,
    deck_snapshot   jsonb,
    completed_at    timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

ALTER TABLE bandit_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandit_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandit_spectators ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandit_round_history ENABLE ROW LEVEL SECURITY;

-- Games: any authenticated user can read; participants can update
CREATE POLICY "bandit_games_select" ON bandit_games
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "bandit_games_insert" ON bandit_games
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

CREATE POLICY "bandit_games_update" ON bandit_games
    FOR UPDATE TO authenticated USING (
        host_id = auth.uid()
        OR id IN (SELECT game_id FROM bandit_players WHERE profile_id = auth.uid())
    );

-- Players: participants can read; own row can be modified
CREATE POLICY "bandit_players_select" ON bandit_players
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "bandit_players_insert" ON bandit_players
    FOR INSERT TO authenticated WITH CHECK (
        profile_id = auth.uid()
        OR game_id IN (SELECT id FROM bandit_games WHERE host_id = auth.uid())
    );

CREATE POLICY "bandit_players_update" ON bandit_players
    FOR UPDATE TO authenticated USING (
        profile_id = auth.uid()
        OR game_id IN (SELECT id FROM bandit_games WHERE host_id = auth.uid())
    );

CREATE POLICY "bandit_players_delete" ON bandit_players
    FOR DELETE TO authenticated USING (
        profile_id = auth.uid()
        OR game_id IN (SELECT id FROM bandit_games WHERE host_id = auth.uid())
    );

-- Spectators: same pattern
CREATE POLICY "bandit_spectators_select" ON bandit_spectators
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "bandit_spectators_insert" ON bandit_spectators
    FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

CREATE POLICY "bandit_spectators_delete" ON bandit_spectators
    FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- Round history: readable by participants
CREATE POLICY "bandit_round_history_select" ON bandit_round_history
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "bandit_round_history_insert" ON bandit_round_history
    FOR INSERT TO authenticated WITH CHECK (
        game_id IN (SELECT game_id FROM bandit_players WHERE profile_id = auth.uid())
    );

-- ═══════════════════════════════════════════════════════════
-- REALTIME — enable for bandit_games
-- ═══════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE bandit_games;
ALTER PUBLICATION supabase_realtime ADD TABLE bandit_players;

-- ═══════════════════════════════════════════════════════════
-- HELPER FOR TESTING — Delete own account
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_user_self()
RETURNS void AS $$
BEGIN
  -- Delete player records
  DELETE FROM bandit_players WHERE profile_id = auth.uid();
  
  -- Delete spectator records
  DELETE FROM bandit_spectators WHERE profile_id = auth.uid();
  
  -- Delete games hosted by the user
  DELETE FROM bandit_games WHERE host_id = auth.uid();
  
  -- Delete user profile
  DELETE FROM profiles WHERE id = auth.uid();
  
  -- Delete auth user
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

