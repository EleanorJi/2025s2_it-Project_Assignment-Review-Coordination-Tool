select * from app_user;
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
WHERE criterion_id = 10;
select * from marker_score;
select * from upload;