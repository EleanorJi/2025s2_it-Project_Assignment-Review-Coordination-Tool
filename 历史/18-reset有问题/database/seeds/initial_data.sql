INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
 'admin',
 'admin@grading.com',
 '$2b$12$ai/bCmRjtkZgsi9nY/mnueawJEoBnKoHqWRtm.lu0nycUELBYYR9u',
 'COORDINATOR',
 true
);

INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
 'marker',
 'marker@grading.com',
 '$2b$12$ai/bCmRjtkZgsi9nY/mnueawJEoBnKoHqWRtm.lu0nycUELBYYR9u',
 'MARKER',
 true
);