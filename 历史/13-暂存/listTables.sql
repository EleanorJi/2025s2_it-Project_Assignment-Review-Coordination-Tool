select * from app_user;
select * from invitations;
INSERT INTO app_user (name, email, password_hash, role, is_active)
VALUES (
 'test',
 '1612324676@qq.com',
 'test123',
 'COORDINATOR',
 true
);
select * from rubric;
select * from rubric_criterion;
select * from criterion_grade_level;
UPDATE assignment
SET due_at = '2025-10-23 10:00:00'::timestamp
WHERE assignment_id = 1;
select * from assignment;
UPDATE project
SET status = 'completed'
WHERE project_id = 2;
select * from project;
select * from baseline_score;
UPDATE baseline_score
SET finalized = false
WHERE baseline_id = 12;
select * from marker_score;
select * from upload;
ALTER TABLE public.app_user 
ADD COLUMN reset_token VARCHAR(64),
ADD COLUMN reset_token_expiry TIMESTAMP WITH TIME ZONE;