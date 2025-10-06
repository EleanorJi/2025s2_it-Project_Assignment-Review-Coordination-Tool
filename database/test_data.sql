-- Test data for dashboard APIs

-- Insert test projects
INSERT INTO project (name, description, status, created_by) VALUES
('HPS302 Assignment 1', 'First assignment for moderation', 'active', 1),
('HPS302 Assignment 2', 'Second assignment for moderation', 'draft', 1);

-- Insert test assignments
INSERT INTO assignment (name, description, due_at, round, project_id, is_published) VALUES
('Moderation 1', 'First moderation round', NOW() + INTERVAL '7 days', 1, 1, true),
('Moderation 2', 'Second moderation round', NOW() + INTERVAL '14 days', 2, 1, false),
('Moderation 1', 'First moderation round for project 2', NOW() + INTERVAL '10 days', 1, 2, false);

-- Insert test rubric
INSERT INTO rubric (uploaded_by, project_id, version, "row", "column") VALUES
(1, 1, 1, 4, 3),
(1, 2, 1, 4, 3);

-- Insert test rubric criteria
INSERT INTO rubric_criterion (rubric_id, seq_no, title, description, max_score) VALUES
(1, 1, 'Content Quality', 'Quality of content and analysis', 25.0),
(1, 2, 'Structure', 'Organization and structure', 20.0),
(1, 3, 'Language', 'Grammar and language use', 15.0),
(2, 1, 'Content Quality', 'Quality of content and analysis', 25.0),
(2, 2, 'Structure', 'Organization and structure', 20.0),
(2, 3, 'Language', 'Grammar and language use', 15.0);

-- Insert test marker scores
INSERT INTO marker_score (assignment_id, criterion_id, marker_id, score, comment, submitted_at) VALUES
(1, 1, 2, 22.0, 'Good content but could be more detailed', NOW() - INTERVAL '2 days'),
(1, 2, 2, 18.0, 'Well structured', NOW() - INTERVAL '2 days'),
(1, 3, 2, 12.0, 'Minor grammar issues', NOW() - INTERVAL '2 days');

-- Insert test feedback
INSERT INTO feedback (assignment_id, marker_id, content, created_by, title) VALUES
(1, 2, 'Scores differ on criterion 3 (+7%). Please review.', 1, 'Score Review Required');

-- Insert test invitations
INSERT INTO invitations (email, token, created_by, expires_at) VALUES
('newmarker@deakin.edu.au', 'test-token-123', 1, NOW() + INTERVAL '7 days'),
('anothermarker@deakin.edu.au', 'test-token-456', 1, NOW() - INTERVAL '1 day'); -- Expired
