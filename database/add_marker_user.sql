-- Add Marker user to database
-- Note: Current system uses plaintext password comparison, production environment should use encrypted passwords

INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
    'Marker1',
    'marker1@example.com',
    '12345678',  -- Plaintext password, current system compares directly
    'MARKER',
    true
);

-- Verify insertion result
SELECT user_id, name, email, role, is_active, created_at 
FROM app_user 
WHERE email = 'marker1@example.com';

