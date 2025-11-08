INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
    'admin',
    'admin@grading.com',
    -- 这里需要填入加密后的密码，不是明文！详见下面的密码加密说明
    'admin123',
    'COORDINATOR',
    true
);

INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
    'Marker1',
    'marker1@example.com',
    -- 这里需要填入加密后的密码，不是明文！详见下面的密码加密说明
    '12345678',
    'MARKER',
    true
);

SELECT * FROM app_user;