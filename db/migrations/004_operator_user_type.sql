-- Operators need a persistent role for normal sign-in outside demo mode.
ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'OPERATOR';
