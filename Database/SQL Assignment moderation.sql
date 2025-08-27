-- 可选：指定 schema
-- create schema if not exists mod; 
-- set search_path to mod, public;

-- 0) 保险起见：先关闭延迟检查（仅本会话），确保按顺序建好
set session_replication_role = 'origin';

-- 1) 用户
create table if not exists app_user(
  user_id       bigserial primary key,
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null check (role in ('COORDINATOR','MARKER')),
  is_active     boolean default true,
  created_at    timestamp default now()
);

-- 2) 开课实例（学期项）
create table if not exists course_offering(
  offering_id bigserial primary key,
  course_code text not null,
  term        text not null,
  year        int  not null,
  title       text,
  created_by  bigint references app_user(user_id),
  created_at  timestamp default now()
);

-- 3) 作业
create table if not exists assignment(
  assignment_id bigserial primary key,
  offering_id   bigint not null references course_offering(offering_id),
  name          text not null,
  description   text,
  due_at        timestamp,
  status        text
);
create index if not exists idx_assignment_offering on assignment(offering_id);

-- 4) Rubric（总表）
create table if not exists rubric(
  rubric_id    bigserial primary key,
  assignment_id bigint not null references assignment(assignment_id),
  version_no    int not null default 1,
  uploaded_by   bigint references app_user(user_id),
  uploaded_at   timestamp default now(),
  is_active     boolean default true
);
create index if not exists idx_rubric_assignment on rubric(assignment_id);

-- 5) Rubric 条目
create table if not exists rubric_criterion(
  criterion_id bigserial primary key,
  rubric_id    bigint not null references rubric(rubric_id) on delete cascade,
  seq_no       int not null,
  title        text not null,
  description  text,
  max_score    numeric(5,2) not null,
  weight       numeric(6,4)
);
create unique index if not exists uq_rubric_criterion_seq on rubric_criterion(rubric_id, seq_no);
create index if not exists idx_rubric_criterion_rubric on rubric_criterion(rubric_id);

-- 6) 学生提交
create table if not exists submission(
  submission_id bigserial primary key,
  assignment_id bigint not null references assignment(assignment_id),
  student_id    text not null,                    -- 可后续独立出学生表
  label         text,                             -- 可用于标记 "baseline"
  is_baseline   boolean default false,            -- 是否基准作业（可与 label 二选一）
  submitted_at  timestamp
);
create index if not exists idx_submission_assignment on submission(assignment_id);
create index if not exists idx_submission_is_baseline on submission(assignment_id, is_baseline);

-- 7) 基准分（对“基准作业”的逐条目打分）
create table if not exists baseline_score(
  baseline_id   bigserial primary key,
  assignment_id bigint not null references assignment(assignment_id),
  submission_id bigint not null references submission(submission_id),
  criterion_id  bigint not null references rubric_criterion(criterion_id),
  score         numeric(5,2) not null,
  comment       text,
  scored_by     bigint references app_user(user_id),
  scored_at     timestamp default now(),
  unique (assignment_id, submission_id, criterion_id)
);
create index if not exists idx_baseline_by_assignment on baseline_score(assignment_id);
create index if not exists idx_baseline_by_criterion  on baseline_score(criterion_id);

-- 8) Marker评分（每个提交×条目×评分人 一条记录）
create table if not exists marker_score(
  marker_score_id bigserial primary key,
  assignment_id   bigint not null references assignment(assignment_id),
  submission_id   bigint not null references submission(submission_id),
  criterion_id    bigint not null references rubric_criterion(criterion_id),
  marker_id       bigint not null references app_user(user_id),
  score           numeric(5,2) not null,
  comment         text,
  submitted_at    timestamp default now(),
  finalized       boolean default false,
  round_no        int default 1,      -- 可选：多轮 moderation 扩展
  unique (submission_id, criterion_id, marker_id, round_no)
);
create index if not exists idx_markerscore_assignment on marker_score(assignment_id);
create index if not exists idx_markerscore_submission on marker_score(submission_id);
create index if not exists idx_markerscore_criterion  on marker_score(criterion_id);
create index if not exists idx_markerscore_marker     on marker_score(marker_id);

-- 9) 上传（统一的文件索引：rubric/作业/报告等）
create table if not exists upload(
  upload_id     bigserial primary key,
  owner_id      bigint references app_user(user_id),
  assignment_id bigint references assignment(assignment_id),
  submission_id bigint references submission(submission_id),
  rubric_id     bigint references rubric(rubric_id),
  file_name     text not null,
  mime_type     text,
  storage_path  text not null,        -- 你们的对象存储路径/相对路径
  uploaded_at   timestamp default now()
);
create index if not exists idx_upload_assignment on upload(assignment_id);
create index if not exists idx_upload_submission on upload(submission_id);
create index if not exists idx_upload_rubric     on upload(rubric_id);

-- 10) 反馈（系统或协调者对 Marker 的反馈）
create table if not exists feedback(
  feedback_id   bigserial primary key,
  assignment_id bigint not null references assignment(assignment_id),
  marker_id     bigint not null references app_user(user_id),
  submission_id bigint references submission(submission_id), -- 可为空：针对整次作业
  content       text not null,
  auto_generated boolean default false,
  created_by     bigint references app_user(user_id),
  created_at     timestamp default now()
);
create index if not exists idx_feedback_assignment on feedback(assignment_id);
create index if not exists idx_feedback_marker     on feedback(marker_id);

-- =============== 实用视图：分差分析（与基准对比） =================
-- 说明：假设同一 assignment 有一个基准 submission（submission.is_baseline = true）
-- 视图输出：每条 MarkerScore 与对应 Baseline 的差异（绝对差、相对差）
drop view if exists v_score_diff;
create view v_score_diff as
with baseline as (
  select bs.assignment_id,
         bs.submission_id as baseline_submission_id,
         bs.criterion_id,
         bs.score         as baseline_score,
         rc.max_score
  from baseline_score bs
  join rubric_criterion rc on rc.criterion_id = bs.criterion_id
)
select
  ms.marker_score_id,
  ms.assignment_id,
  ms.submission_id,
  ms.criterion_id,
  ms.marker_id,
  ms.score            as marker_score,
  b.baseline_submission_id,
  b.baseline_score,
  (ms.score - b.baseline_score)                           as raw_diff,
  abs(ms.score - b.baseline_score)                        as abs_diff,
  case when nullif(b.max_score,0) is null
       then null
       else (ms.score - b.baseline_score) / b.max_score
  end                                                     as pct_diff,
  (abs(ms.score - b.baseline_score) > coalesce(b.max_score,0) * 0.05) as over_5pct
from marker_score ms
join baseline b
  on b.assignment_id = ms.assignment_id
 and b.criterion_id  = ms.criterion_id;

-- 常用：给几个便捷索引提升视图查询
create index if not exists idx_baseline_assign_crit on baseline_score(assignment_id, criterion_id);

-- =================== 完成 ===================
