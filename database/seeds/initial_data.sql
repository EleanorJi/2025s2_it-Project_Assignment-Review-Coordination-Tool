INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
 'admin',
 'admin@grading.com',
 'admin123',
 'COORDINATOR',
 true
);

INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
 'marker',
 'marker@grading.com',
 'marker123',
 'MARKER',
 true
);