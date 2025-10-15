const db = require('../config/database');
const EmailService = require('../services/emailService');
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Australia/Melbourne';

async function ensureNotificationLogTable() {
  // Create table if not exists (new structure includes notification_type)
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.notification_log (
      id bigserial PRIMARY KEY,
      assignment_id bigint NOT NULL REFERENCES public.assignment(assignment_id) ON DELETE CASCADE,
      notification_type text NOT NULL DEFAULT 'deadline_passed',
      notified_at timestamp without time zone DEFAULT now()
    )
  `);

  // Try to add column if it does not exist (for existing deployments)
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notification_log' AND column_name = 'notification_type'
      ) THEN
        ALTER TABLE public.notification_log
          ADD COLUMN notification_type text NOT NULL DEFAULT 'deadline_passed';
      END IF;
    END$$;
  `);

  // Drop legacy unique constraint if present, then ensure unique index on (assignment_id, notification_type)
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'uq_notification_log_assignment' AND table_name = 'notification_log'
      ) THEN
        ALTER TABLE public.notification_log DROP CONSTRAINT uq_notification_log_assignment;
      END IF;
    END$$;
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_log_assignment_type
      ON public.notification_log(assignment_id, notification_type);
  `);
}

async function fetchDueAssignments() {
  const result = await db.query(
    `SELECT a.assignment_id,
            a.name AS assignment_name,
            a.due_at,
            p.project_id,
            p.name AS project_name,
            p.status AS project_status,
            now() AS current_time_utc,
            (now() AT TIME ZONE '${BUSINESS_TZ}') AS current_time_local
       FROM public.assignment a
       JOIN public.project p ON p.project_id = a.project_id
      WHERE p.status = 'active'
        AND a.due_at <= (now() AT TIME ZONE '${BUSINESS_TZ}')`
  );
  
  console.log('🔍 Due assignments query result (by TZ=', BUSINESS_TZ, '):', result.rows);
  return result.rows;
}

async function fetchActiveCoordinators() {
  // Get all active COORDINATOR users from app_user table
  const result = await db.query(
    `SELECT user_id, name, email
     FROM app_user
     WHERE is_active = true
       AND UPPER(role) = 'COORDINATOR'
     ORDER BY name`
  );
  return result.rows;
}

async function fetchActiveUsers() {
  // Get all active users (both COORDINATOR and MARKER) from app_user table
  const result = await db.query(
    `SELECT user_id, name, email, role
     FROM app_user
     WHERE is_active = true
       AND UPPER(role) IN ('COORDINATOR', 'MARKER')
     ORDER BY name`
  );
  return result.rows;
}

async function notifyUsersForAssignment(assignment, users) {
  console.log(`🔄 Attempting to log notification for assignment ${assignment.assignment_id}`);
  
  // If marking completed was already notified, skip deadline passed notification
  const mc = await db.query(
    `SELECT 1 FROM public.notification_log 
      WHERE assignment_id = $1 AND notification_type = 'marking_completed' 
      LIMIT 1`,
    [assignment.assignment_id]
  );
  if (mc.rowCount > 0) {
    console.log(`⏭️ Skipping deadline_passed: marking_completed already sent for assignment ${assignment.assignment_id}`);
    return;
  }

  // Try to insert log first; if already exists, skip sending
  const insertRes = await db.query(
    `INSERT INTO public.notification_log (assignment_id, notification_type)
      VALUES ($1, $2)
      ON CONFLICT (assignment_id, notification_type) DO NOTHING
      RETURNING id`,
    [assignment.assignment_id, 'deadline_passed']
  );

  if (insertRes.rowCount === 0) {
    console.log(`⚠️ Assignment ${assignment.assignment_id} already notified, skipping`);
    return;
  }

  console.log(`✅ Logged notification for assignment ${assignment.assignment_id}`);
  console.log(`📧 Sending emails to ${users.length} users`);

  // Build list of active markers who have NOT finalized any score for this assignment
  // Strategy: all active users with role 'MARKER' MINUS those who finalized for this assignment
  const pendingMarkers = await db.query(
    `SELECT u.user_id, u.name, u.email
       FROM app_user u
      WHERE u.is_active = true
        AND UPPER(u.role) = 'MARKER'
        AND NOT EXISTS (
          SELECT 1 FROM marker_score ms
           WHERE ms.assignment_id = $1
             AND ms.marker_id = u.user_id
             AND ms.finalized = true
        )
      ORDER BY u.name`,
    [assignment.assignment_id]
  );

  // Build pending section for COORDINATOR emails only
  let pendingSection = '';
  if (pendingMarkers.rows.length > 0) {
    const listItems = pendingMarkers.rows
      .map(m => `<li>${m.name || 'Unknown'} &lt;${m.email || 'no-email'}&gt;</li>`) 
      .join('');
    pendingSection = `<p><strong>Pending markers (no finalized score):</strong></p><ul>${listItems}</ul>`;
  }

  // Separate users by role
  const coordinators = users.filter(u => u.role && u.role.toUpperCase() === 'COORDINATOR');
  const markers = users.filter(u => u.role && u.role.toUpperCase() === 'MARKER');

  console.log(`👥 Sending to ${coordinators.length} coordinators (with pending markers info)`);
  console.log(`👥 Sending to ${markers.length} markers (without pending markers info)`);

  const dueAtStr = new Date(assignment.due_at).toLocaleString();
  
  // Send emails to coordinators with pending markers information
  const coordinatorEmailResults = await Promise.allSettled(
    coordinators.map((u) =>
      EmailService.sendAssignmentDeadlineEmail(
        u.email,
        u.name || 'User',
        assignment.assignment_name,
        assignment.project_name,
        dueAtStr,
        pendingSection  // Include pending markers info for coordinators
      )
    )
  );

  // Send emails to markers without pending markers information
  const markerEmailResults = await Promise.allSettled(
    markers.map((u) =>
      EmailService.sendAssignmentDeadlineEmail(
        u.email,
        u.name || 'User',
        assignment.assignment_name,
        assignment.project_name,
        dueAtStr,
        ''  // No pending markers info for markers
      )
    )
  );

  // Combine all email results
  const emailResults = [...coordinatorEmailResults, ...markerEmailResults];
  const allUsers = [...coordinators, ...markers];

  // Log email results
  emailResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`✅ Email sent successfully to ${allUsers[index].email}`);
    } else {
      console.error(`❌ Failed to send email to ${allUsers[index].email}:`, result.reason);
    }
  });
}

async function notifyMarkingCompletedForAssignment(assignment, users) {
  console.log(`🔄 Attempting to log marking completion for assignment ${assignment.assignment_id}`);

  // Avoid sending if due already passed
  if (new Date(assignment.due_at).getTime() <= Date.now()) {
    console.log(`⌛ Assignment ${assignment.assignment_id} already due, skip completion notice`);
    return;
  }

  // Insert completion notification log; skip if exists
  const insertRes = await db.query(
    `INSERT INTO public.notification_log (assignment_id, notification_type)
      VALUES ($1, 'marking_completed')
      ON CONFLICT (assignment_id, notification_type) DO NOTHING
      RETURNING id`,
    [assignment.assignment_id]
  );

  if (insertRes.rowCount === 0) {
    console.log(`⚠️ Assignment ${assignment.assignment_id} completion already notified, skipping`);
    return;
  }

  console.log(`✅ Logged completion notification for assignment ${assignment.assignment_id}`);
  console.log(`📧 Sending completion emails to ${users.length} users`);

  const emailResults = await Promise.allSettled(
    users.map((u) =>
      EmailService.sendMarkingCompletedEmail(
        u.email,
        u.name || 'User',
        assignment.assignment_name,
        assignment.project_name
      )
    )
  );

  emailResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`✅ Completion email sent to ${users[index].email}`);
    } else {
      console.error(`❌ Failed to send completion email to ${users[index].email}:`, result.reason);
    }
  });
}

async function checkAndNotifyDeadlines() {
  try {
    console.log('🔍 Checking for deadline notifications...');
    await ensureNotificationLogTable();
    console.log('✅ Notification log table ensured');
    
    const [assignments, users] = await Promise.all([
      fetchDueAssignments(),
      fetchActiveUsers()
    ]);

    console.log(`📋 Found ${assignments?.length || 0} overdue assignments`);
    console.log(`👥 Found ${users?.length || 0} active users to notify`);

    if (!assignments || assignments.length === 0) {
      console.log('ℹ️ No overdue assignments found');
      return;
    }

    if (!users || users.length === 0) {
      console.log('ℹ️ No active users to notify');
      return;
    }

    for (const asg of assignments) {
      console.log(`📧 Processing assignment: ${asg.assignment_name} (ID: ${asg.assignment_id})`);
      await notifyUsersForAssignment(asg, users);
    }
    
    console.log('✅ Deadline check completed');
  } catch (err) {
    console.error('❌ Deadline notifier failure:', err);
  }
}

async function fetchAssignmentsForCompletionCheck() {
  const result = await db.query(
    `SELECT a.assignment_id,
            a.name AS assignment_name,
            a.due_at,
            p.project_id,
            p.name AS project_name
       FROM public.assignment a
       JOIN public.project p ON p.project_id = a.project_id
      WHERE p.status = 'active'
        AND a.due_at > (now() AT TIME ZONE '${BUSINESS_TZ}')`
  );
  return result.rows;
}

async function fetchAssignmentsDueInTwoDays() {
  // Any assignment due within the next 2 days (one-time due_soon per assignment via notification_log)
  const result = await db.query(
    `SELECT a.assignment_id,
            a.name AS assignment_name,
            a.due_at,
            p.project_id,
            p.name AS project_name
       FROM public.assignment a
       JOIN public.project p ON p.project_id = a.project_id
      WHERE p.status = 'active'
        AND a.due_at > (now() AT TIME ZONE '${BUSINESS_TZ}')
        AND a.due_at <= (now() AT TIME ZONE '${BUSINESS_TZ}') + INTERVAL '2 days'`
  );
  return result.rows;
}

async function notifyDueSoonForAssignment(assignment, users) {
  // Insert due-soon log first; prevent duplicates
  const insertRes = await db.query(
    `INSERT INTO public.notification_log (assignment_id, notification_type)
      VALUES ($1, 'due_soon')
      ON CONFLICT (assignment_id, notification_type) DO NOTHING
      RETURNING id`,
    [assignment.assignment_id]
  );

  console.log(`🧾 Due-soon log insert rowCount=${insertRes.rowCount}, assignment_id=${assignment.assignment_id}`);

  if (insertRes.rowCount === 0) {
    console.log(`⚠️ Due-soon already notified for assignment ${assignment.assignment_id}`);
    return;
  }

  console.log(`📧 Sending due-soon emails to ${users.length} users`);

  const dueAtStr = new Date(assignment.due_at).toLocaleString();
  const emailResults = await Promise.allSettled(
    users.map((u) =>
      EmailService.sendDueSoonEmail(
        u.email,
        u.name || 'User',
        assignment.assignment_name,
        assignment.project_name,
        dueAtStr
      )
    )
  );

  // Log email results
  emailResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`✅ Due-soon email sent successfully to ${users[index].email}`);
    } else {
      console.error(`❌ Failed to send due-soon email to ${users[index].email}:`, result.reason);
    }
  });
}

async function checkAndNotifyDueSoon() {
  try {
    await ensureNotificationLogTable();
    const [assignments, users] = await Promise.all([
      fetchAssignmentsDueInTwoDays(),
      fetchActiveUsers()
    ]);
    
    console.log(`⏳ Found ${assignments?.length || 0} assignments due within 2 days`);
    console.log(`👥 Found ${users?.length || 0} active users to notify`);
    
    if (!assignments || assignments.length === 0) return;
    if (!users || users.length === 0) {
      console.log('ℹ️ No active users to notify for due-soon');
      return;
    }
    
    for (const asg of assignments) {
      await notifyDueSoonForAssignment(asg, users);
    }
  } catch (err) {
    console.error('❌ Due-soon checker failure:', err);
  }
}
async function allActiveMarkersCompleted(assignmentId) {
  // A marker is considered assigned if they have at least one score row for this assignment's criteria at any time
  // Completion means that for each such marker, there exists at least one finalized=true row
  const result = await db.query(
    `WITH assigned_markers AS (
       SELECT DISTINCT ms.marker_id
       FROM marker_score ms
       WHERE ms.assignment_id = $1
     )
     SELECT 
       COUNT(*) FILTER (WHERE m.marker_id IS NOT NULL) AS assigned,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM marker_score ms2 
         WHERE ms2.assignment_id = $1 
           AND ms2.marker_id = m.marker_id 
           AND ms2.finalized = true
       )) AS completed
     FROM assigned_markers m`,
    [assignmentId]
  );

  const row = result.rows[0];
  const assigned = parseInt(row.assigned || 0, 10);
  const completed = parseInt(row.completed || 0, 10);
  console.log(`📊 Completion check: assignment_id=${assignmentId}, assigned=${assigned}, completed=${completed}`);
  return assigned > 0 && assigned === completed;
}

async function checkAndNotifyMarkingCompletion() {
  try {
    const assignments = await fetchAssignmentsForCompletionCheck();
    if (!assignments || assignments.length === 0) return;

    // Get all active COORDINATOR users for marking completion notifications
    const coordinators = await fetchActiveCoordinators();
    if (!coordinators || coordinators.length === 0) {
      console.log('ℹ️ No active coordinators to notify for marking completion');
      return;
    }

    console.log(`👥 Found ${coordinators.length} active coordinators for marking completion notifications`);

    for (const asg of assignments) {
      const done = await allActiveMarkersCompleted(asg.assignment_id);
      if (done) {
        await notifyMarkingCompletedForAssignment(asg, coordinators);
      }
    }
  } catch (err) {
    console.error('❌ Completion checker failure:', err);
  }
}
function startDeadlineNotifier() {
  const intervalMs = parseInt(process.env.DEADLINE_CHECK_INTERVAL_MS || '60000', 10);
  // Run immediately once at startup
  checkAndNotifyDeadlines().catch((e) => console.error('Initial deadline check error:', e));
  // Then schedule periodically
  setInterval(() => {
    checkAndNotifyDeadlines().catch((e) => console.error('Scheduled deadline check error:', e));
  }, intervalMs);

  // Also periodically check for marking completion prior to due
  setInterval(() => {
    checkAndNotifyMarkingCompletion().catch((e) => console.error('Scheduled completion check error:', e));
  }, intervalMs);

  // Due-soon (2 days before) checker
  setInterval(() => {
    checkAndNotifyDueSoon().catch((e) => console.error('Scheduled due-soon check error:', e));
  }, intervalMs);

  // Run due-soon once at startup as well
  checkAndNotifyDueSoon().catch((e) => console.error('Initial due-soon check error:', e));
  console.log(`⏰ Deadline notifier started. Interval: ${intervalMs} ms`);
}

module.exports = { startDeadlineNotifier };


