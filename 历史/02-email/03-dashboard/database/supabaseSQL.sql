-- 首先创建所有需要的序列
CREATE SEQUENCE IF NOT EXISTS app_user_user_id_seq;
CREATE SEQUENCE IF NOT EXISTS course_offering_offering_id_seq;
CREATE SEQUENCE IF NOT EXISTS assignment_assignment_id_seq;
CREATE SEQUENCE IF NOT EXISTS rubric_rubric_id_seq;
CREATE SEQUENCE IF NOT EXISTS rubric_criterion_criterion_id_seq;
CREATE SEQUENCE IF NOT EXISTS submission_submission_id_seq;
CREATE SEQUENCE IF NOT EXISTS baseline_score_baseline_id_seq;
CREATE SEQUENCE IF NOT EXISTS marker_score_marker_score_id_seq;
CREATE SEQUENCE IF NOT EXISTS upload_upload_id_seq;
CREATE SEQUENCE IF NOT EXISTS feedback_feedback_id_seq;
CREATE SEQUENCE IF NOT EXISTS invitations_id_seq;

-- 1. 首先创建最基础的表（没有外键依赖）
CREATE TABLE public.app_user (
  user_id bigint NOT NULL DEFAULT nextval('app_user_user_id_seq'::regclass),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['COORDINATOR'::text, 'MARKER'::text])),
  is_active boolean DEFAULT true,
  last_login timestamp with time zone DEFAULT now(),
  CONSTRAINT app_user_pkey PRIMARY KEY (user_id)
);
CREATE UNIQUE INDEX ON public.app_user (email);

-- 2. 创建依赖app_user的表
CREATE TABLE public.course_offering (
  offering_id bigint NOT NULL DEFAULT nextval('course_offering_offering_id_seq'::regclass),
  course_code text NOT NULL,
  term text NOT NULL,
  year integer NOT NULL,
  name text,
  created_by bigint,
  CONSTRAINT course_offering_pkey PRIMARY KEY (offering_id),
  CONSTRAINT course_offering_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id)
);

CREATE TABLE public.invitations (
  id integer NOT NULL DEFAULT nextval('invitations_id_seq'::regclass),
  email character varying NOT NULL,
  token character varying NOT NULL,
  created_by bigint,
  created_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone NOT NULL,
  used_at timestamp without time zone,
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id)
);
CREATE UNIQUE INDEX ON public.invitations (token);

-- 3. 创建依赖course_offering的表
CREATE TABLE public.assignment (
  assignment_id bigint NOT NULL DEFAULT nextval('assignment_assignment_id_seq'::regclass),
  offering_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  due_at timestamp without time zone,
  status text,
  CONSTRAINT assignment_pkey PRIMARY KEY (assignment_id),
  CONSTRAINT assignment_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offering(offering_id)
);

-- 4. 创建依赖assignment的表
CREATE TABLE public.rubric (
  rubric_id bigint NOT NULL DEFAULT nextval('rubric_rubric_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  uploaded_by bigint NOT NULL,
  CONSTRAINT rubric_pkey PRIMARY KEY (rubric_id),
  CONSTRAINT rubric_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.app_user(user_id),
  CONSTRAINT rubric_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id)
);

CREATE TABLE public.submission (
  submission_id bigint NOT NULL DEFAULT nextval('submission_submission_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  sample_no integer NOT NULL CHECK (sample_no = ANY (ARRAY[1, 2])),
  CONSTRAINT submission_pkey PRIMARY KEY (submission_id),
  CONSTRAINT submission_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id)
);

-- 5. 创建依赖rubric的表
CREATE TABLE public.rubric_criterion (
  criterion_id bigint NOT NULL DEFAULT nextval('rubric_criterion_criterion_id_seq'::regclass),
  rubric_id bigint NOT NULL,
  seq_no integer NOT NULL,
  title text NOT NULL,
  description text,
  max_score numeric NOT NULL,
  CONSTRAINT rubric_criterion_pkey PRIMARY KEY (criterion_id),
  CONSTRAINT rubric_criterion_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubric(rubric_id)
);

-- 6. 创建依赖多个表的复杂关系表
CREATE TABLE public.baseline_score (
  baseline_id bigint NOT NULL DEFAULT nextval('baseline_score_baseline_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  submission_id bigint NOT NULL,
  criterion_id bigint NOT NULL,
  score numeric NOT NULL,
  comment text,
  scored_by bigint,
  CONSTRAINT baseline_score_pkey PRIMARY KEY (baseline_id),
  CONSTRAINT baseline_score_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submission(submission_id),
  CONSTRAINT baseline_score_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id),
  CONSTRAINT baseline_score_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.rubric_criterion(criterion_id),
  CONSTRAINT baseline_score_scored_by_fkey FOREIGN KEY (scored_by) REFERENCES public.app_user(user_id)
);

CREATE TABLE public.marker_score (
  marker_score_id bigint NOT NULL DEFAULT nextval('marker_score_marker_score_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  submission_id bigint NOT NULL,
  criterion_id bigint NOT NULL,
  marker_id bigint NOT NULL,
  score numeric NOT NULL,
  comment text,
  submitted_at timestamp without time zone DEFAULT now(),
  finalized boolean DEFAULT false,
  CONSTRAINT marker_score_pkey PRIMARY KEY (marker_score_id),
  CONSTRAINT marker_score_marker_id_fkey FOREIGN KEY (marker_id) REFERENCES public.app_user(user_id),
  CONSTRAINT marker_score_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.rubric_criterion(criterion_id),
  CONSTRAINT marker_score_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id),
  CONSTRAINT marker_score_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submission(submission_id)
);

CREATE TABLE public.feedback (
  feedback_id bigint NOT NULL DEFAULT nextval('feedback_feedback_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  marker_id bigint NOT NULL,
  submission_id bigint,
  content text NOT NULL,
  created_by bigint,
  created_at timestamp without time zone DEFAULT now(),
  title text,
  CONSTRAINT feedback_pkey PRIMARY KEY (feedback_id),
  CONSTRAINT feedback_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(user_id),
  CONSTRAINT feedback_marker_id_fkey FOREIGN KEY (marker_id) REFERENCES public.app_user(user_id),
  CONSTRAINT feedback_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id),
  CONSTRAINT feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submission(submission_id)
);

CREATE TABLE public.upload (
  upload_id bigint NOT NULL DEFAULT nextval('upload_upload_id_seq'::regclass),
  assignment_id bigint,
  submission_id bigint,
  rubric_id bigint,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text NOT NULL,
  CONSTRAINT upload_pkey PRIMARY KEY (upload_id),
  CONSTRAINT upload_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignment(assignment_id),
  CONSTRAINT upload_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubric(rubric_id),
  CONSTRAINT upload_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submission(submission_id)
);

-- 创建索引（可选，可以在表创建后单独创建）
CREATE INDEX IF NOT EXISTS idx_assignment_offering ON public.assignment(offering_id);
CREATE INDEX IF NOT EXISTS idx_rubric_assignment ON public.rubric(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submission_assignment ON public.submission(assignment_id);
CREATE INDEX IF NOT EXISTS idx_rubric_criterion_rubric ON public.rubric_criterion(rubric_id);
CREATE INDEX IF NOT EXISTS idx_baseline_by_assignment ON public.baseline_score(assignment_id);
CREATE INDEX IF NOT EXISTS idx_baseline_by_criterion ON public.baseline_score(criterion_id);
CREATE INDEX IF NOT EXISTS idx_markerscore_assignment ON public.marker_score(assignment_id);
CREATE INDEX IF NOT EXISTS idx_markerscore_submission ON public.marker_score(submission_id);
CREATE INDEX IF NOT EXISTS idx_markerscore_criterion ON public.marker_score(criterion_id);
CREATE INDEX IF NOT EXISTS idx_markerscore_marker ON public.marker_score(marker_id);
CREATE INDEX IF NOT EXISTS idx_upload_assignment ON public.upload(assignment_id);
CREATE INDEX IF NOT EXISTS idx_upload_submission ON public.upload(submission_id);
CREATE INDEX IF NOT EXISTS idx_upload_rubric ON public.upload(rubric_id);
CREATE INDEX IF NOT EXISTS idx_feedback_assignment ON public.feedback(assignment_id);
CREATE INDEX IF NOT EXISTS idx_feedback_marker ON public.feedback(marker_id);

-- 验证表创建成功
SELECT 'Tables created successfully!' as status;