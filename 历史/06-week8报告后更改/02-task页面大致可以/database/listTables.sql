select * from rubric;
select * from rubric_criterion;
select * from criterion_grade_level;
UPDATE assignment
SET is_published = false
WHERE assignment_id = 1;
select * from assignment;
UPDATE project
SET status = 'completed'
WHERE project_id = 2;
select * from project;