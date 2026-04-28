-- ============================================================
-- Seed: initial admin user
--
-- HOW TO USE:
-- 1. Generate a password hash:
--      node scripts/hash-password.mjs "your-strong-password"
-- 2. Replace PASTE_HASH_HERE below with the output
-- 3. Run:
--      npm run db:seed
-- ============================================================

INSERT INTO users (id, username, display_name, password_hash, role)
VALUES (
  'usr_admin',
  'admin',
  'מנהל',
  'PASTE_HASH_HERE',
  'admin'
);

-- Add more employees with the same pattern. Example:
-- INSERT INTO users (id, username, display_name, password_hash, role) VALUES
--   ('usr_emp1', 'yoni',  'יוני',  'PASTE_HASH_HERE', 'employee'),
--   ('usr_emp2', 'sarah', 'שרה',  'PASTE_HASH_HERE', 'employee');
