-- =============================================
-- Supabase Database Schema — روليت السحب العشوائي
-- =============================================
-- Run this SQL in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1) Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  emp_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Draws history table
CREATE TABLE IF NOT EXISTS draws (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  winner_name TEXT NOT NULL,
  winner_emp_id TEXT NOT NULL,
  total_participants INTEGER NOT NULL DEFAULT 0,
  drawn_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Enable Row Level Security (RLS) but allow all operations (public app)
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read/write participants
CREATE POLICY "Allow all on participants" ON participants
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anyone to read/write draws
CREATE POLICY "Allow all on draws" ON draws
  FOR ALL USING (true) WITH CHECK (true);

-- 4) Enable Realtime for participants table (so other devices get live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE draws;
