-- 添加Marker用户到数据库
-- 注意：当前系统使用明文密码比较，生产环境应该使用加密密码

INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
    'Marker1',
    'marker1@example.com',
    '12345678',  -- 明文密码，当前系统直接比较
    'MARKER',
    true
);

-- 验证插入结果
SELECT user_id, name, email, role, is_active, created_at 
FROM app_user 
WHERE email = 'marker1@example.com';

