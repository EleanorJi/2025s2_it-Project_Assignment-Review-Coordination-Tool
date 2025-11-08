select * from project;
select * from rubric;
select * from rubric_criterion;
select * from criterion_grade_level;
select * from assignment;
UPDATE project
SET status = 'completed'
WHERE project_id = 3;
select * from project;