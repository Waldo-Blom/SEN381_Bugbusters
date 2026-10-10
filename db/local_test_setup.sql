-- CivicConnect local test database setup.
--
-- In pgAdmin, create a database matching DB_DATABASE in .env, then open Query
-- Tool for that database and execute this entire file. This creates the schema
-- and inserts a small linked demo dataset. Run it only against a new/empty DB.

BEGIN;

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE "user_type" AS ENUM (
  'REQUESTER',
  'STAFF',
  'MANAGER',
  'ADMIN',
  'OPERATOR'
);

CREATE TYPE "request_status" AS ENUM (
  'SUBMITTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED'
);

CREATE TYPE "priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "comment_type" AS ENUM ('ACTION', 'RESOLUTION', 'NOTE', 'UPDATE');

CREATE TYPE "action_type" AS ENUM (
  'USER_CREATED',
  'USER_MODIFIED',
  'USER_DEACTIVATED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_MODIFIED',
  'STAFF_ASSIGNED',
  'STAFF_REMOVED',
  'MANAGER_CREATED',
  'MANAGER_REMOVED',
  'CATEGORY_CREATED',
  'CATEGORY_MODIFIED'
);

CREATE TYPE "target_type" AS ENUM ('USER', 'DEPARTMENT', 'CATEGORY', 'ASSIGNMENT');

-- ==========================================
-- CORE / USER MANAGEMENT
-- ==========================================
CREATE TABLE "users" (
  "user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "phone" varchar(15),
  "user_type" user_type NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "email_notifications_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "last_login_at" timestamp
);

CREATE TABLE "departments" (
  "department_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) UNIQUE NOT NULL,
  "description" text,
  "manager_id" uuid NOT NULL UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "staff_assignments" (
  "staff_assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "assigned_by" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "assigned_at" timestamp NOT NULL DEFAULT now(),
  "removed_at" timestamp
);

CREATE TABLE "request_categories" (
  "category_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) UNIQUE NOT NULL,
  "description" text,
  "department_id" uuid NOT NULL,
  "target_resolution_time" interval,
  "is_active" boolean NOT NULL DEFAULT true,
  "display_order" integer DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "external_requesters" (
  "external_requester_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "phone" varchar(30),
  "email" varchar(255),
  "preferred_contact_method" varchar(10) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "external_requester_contact_required"
    CHECK (
      (phone IS NOT NULL AND btrim(phone) <> '')
      OR (email IS NOT NULL AND btrim(email) <> '')
    ),
  CONSTRAINT "external_requester_preferred_contact_valid"
    CHECK (preferred_contact_method IN ('PHONE', 'EMAIL'))
);

-- ==========================================
-- REQUEST WORKFLOW
-- ==========================================
CREATE TABLE "service_requests" (
  "request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_number" varchar(20) UNIQUE NOT NULL,
  "requester_id" uuid,
  "external_requester_id" uuid,
  "created_by" uuid NOT NULL,
  "submission_channel" varchar(20) NOT NULL,
  "category_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "location" varchar(255),
  "status" request_status NOT NULL DEFAULT 'SUBMITTED',
  "priority" priority DEFAULT 'MEDIUM',
  "assigned_staff_id" uuid,
  "assigned_at" timestamp,
  "assigned_by" uuid,
  "contact_information_approved" boolean NOT NULL DEFAULT false,
  "contact_approved_by" uuid,
  "contact_approved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "expected_completion_at" timestamp,
  "resolved_at" timestamp,
  "closed_at" timestamp,
  "overdue_flag" boolean,
  CONSTRAINT "service_requests_exactly_one_requester"
    CHECK ((requester_id IS NOT NULL) <> (external_requester_id IS NOT NULL)),
  CONSTRAINT "service_requests_submission_channel_valid"
    CHECK (submission_channel IN ('APP', 'PHONE', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'PAPER'))
);

CREATE TABLE "request_attachments" (
  "attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_path" varchar(500) NOT NULL,
  "file_size_bytes" integer NOT NULL,
  "file_extension_type" varchar(10) NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "uploaded_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "request_status_history" (
  "status_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "old_status" request_status NOT NULL,
  "new_status" request_status NOT NULL,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "request_assignment_history" (
  "assignment_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "assigned_to_staff_id" uuid,
  "assigned_by_id" uuid NOT NULL,
  "assigned_at" timestamp NOT NULL DEFAULT now(),
  "removed_at" timestamp
);

CREATE TABLE "request_comments" (
  "comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "commented_by" uuid NOT NULL,
  "comment_type" comment_type NOT NULL DEFAULT 'NOTE',
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp,
  "is_deleted" boolean DEFAULT false
);

-- ==========================================
-- AUDIT
-- ==========================================
CREATE TABLE "admin_audit_log" (
  "audit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" uuid NOT NULL,
  "action_type" action_type NOT NULL,
  "target_type" target_type NOT NULL,
  "target_id" uuid NOT NULL,
  "changed_data" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE UNIQUE INDEX ON "staff_assignments" ("staff_id", "department_id");
CREATE UNIQUE INDEX "unique_active_staff_assignment"
  ON "staff_assignments" ("staff_id") WHERE "is_active" = true;
CREATE INDEX ON "service_requests" ("requester_id");
CREATE INDEX ON "service_requests" ("external_requester_id");
CREATE INDEX ON "service_requests" ("created_by");
CREATE INDEX ON "service_requests" ("assigned_staff_id");
CREATE INDEX ON "service_requests" ("category_id");
CREATE INDEX ON "service_requests" ("status");
CREATE INDEX ON "service_requests" ("created_at");
CREATE INDEX ON "service_requests" ("expected_completion_at");
CREATE INDEX ON "service_requests" ("overdue_flag");
CREATE INDEX ON "request_attachments" ("request_id");
CREATE INDEX ON "request_attachments" ("uploaded_by");
CREATE INDEX ON "request_status_history" ("request_id");
CREATE INDEX ON "request_status_history" ("changed_at");
CREATE INDEX ON "request_assignment_history" ("request_id");
CREATE INDEX ON "request_assignment_history" ("assigned_at");
CREATE INDEX ON "request_comments" ("request_id");
CREATE INDEX ON "request_comments" ("commented_by");
CREATE INDEX ON "request_comments" ("created_at");

-- ==========================================
-- FOREIGN KEYS
-- ==========================================
ALTER TABLE "departments"
  ADD CONSTRAINT "manages" FOREIGN KEY ("manager_id") REFERENCES "users" ("user_id");
ALTER TABLE "staff_assignments"
  ADD CONSTRAINT "staff" FOREIGN KEY ("staff_id") REFERENCES "users" ("user_id");
ALTER TABLE "staff_assignments"
  ADD CONSTRAINT "assigned_by_manager" FOREIGN KEY ("assigned_by") REFERENCES "users" ("user_id");
ALTER TABLE "request_categories"
  ADD CONSTRAINT "routes" FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id");
ALTER TABLE "staff_assignments"
  ADD CONSTRAINT "has" FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "requester" FOREIGN KEY ("requester_id") REFERENCES "users" ("user_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "external_requester" FOREIGN KEY ("external_requester_id")
    REFERENCES "external_requesters" ("external_requester_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "created_by_user" FOREIGN KEY ("created_by") REFERENCES "users" ("user_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "assigned_staff" FOREIGN KEY ("assigned_staff_id") REFERENCES "users" ("user_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "assigned_by_staff" FOREIGN KEY ("assigned_by") REFERENCES "users" ("user_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "contact_approved_by" FOREIGN KEY ("contact_approved_by") REFERENCES "users" ("user_id");
ALTER TABLE "service_requests"
  ADD CONSTRAINT "categorizes" FOREIGN KEY ("category_id") REFERENCES "request_categories" ("category_id");
ALTER TABLE "request_attachments"
  ADD CONSTRAINT "has_attachment" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE;
ALTER TABLE "request_status_history"
  ADD CONSTRAINT "history" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE;
ALTER TABLE "request_assignment_history"
  ADD CONSTRAINT "assignment_history" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE;
ALTER TABLE "request_comments"
  ADD CONSTRAINT "comments" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE;
ALTER TABLE "request_attachments"
  ADD CONSTRAINT "uploads" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("user_id");
ALTER TABLE "request_status_history"
  ADD CONSTRAINT "changes" FOREIGN KEY ("changed_by") REFERENCES "users" ("user_id");
ALTER TABLE "request_assignment_history"
  ADD CONSTRAINT "assigned_to_staff_history" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "users" ("user_id");
ALTER TABLE "request_assignment_history"
  ADD CONSTRAINT "assigned_by_staff_history" FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("user_id");
ALTER TABLE "request_comments"
  ADD CONSTRAINT "writes" FOREIGN KEY ("commented_by") REFERENCES "users" ("user_id");
ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "performs" FOREIGN KEY ("admin_id") REFERENCES "users" ("user_id");

-- ==========================================
-- SMALL LOCAL TEST DATASET
-- IDs/emails match mock login in the application. Password hashes are dummy
-- values because the current login is a role-based demo login, not real auth.
-- ==========================================
INSERT INTO "users"
  ("user_id", "email", "password_hash", "first_name", "last_name", "phone", "user_type")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'amelia.carter@email.com', 'local-demo-only', 'Amelia', 'Carter', '15552341872', 'REQUESTER'),
  ('00000000-0000-4000-8000-000000000002', 'marcus.doyle@civic.gov', 'local-demo-only', 'Marcus', 'Doyle', '15552341873', 'STAFF'),
  ('00000000-0000-4000-8000-000000000003', 'priya.raman@civic.gov', 'local-demo-only', 'Priya', 'Raman', '15552341874', 'MANAGER'),
  ('00000000-0000-4000-8000-000000000004', 'sam.rivera@civic.gov', 'local-demo-only', 'Sam', 'Rivera', '15552341875', 'OPERATOR');

INSERT INTO "departments" ("department_id", "name", "description", "manager_id")
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'Public Works',
  'Local roads and community infrastructure',
  '00000000-0000-4000-8000-000000000003'
);

INSERT INTO "staff_assignments" ("staff_id", "department_id", "assigned_by")
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003'
);

INSERT INTO "request_categories"
  ("category_id", "name", "description", "department_id", "display_order")
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Roads', 'Potholes and road repairs', '10000000-0000-4000-8000-000000000001', 1),
  ('20000000-0000-4000-8000-000000000002', 'Streetlight', 'Streetlight outages and repairs', '10000000-0000-4000-8000-000000000001', 2);

INSERT INTO "external_requesters"
  ("external_requester_id", "first_name", "last_name", "phone", "email", "preferred_contact_method")
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'Taylor',
  'Morgan',
  '15550000100',
  'taylor.morgan@example.com',
  'PHONE'
);

-- One portal request and one operator-created request exercise both requester
-- reference types and give manager/staff detail pages records to display.
INSERT INTO "service_requests"
  ("request_number", "requester_id", "created_by", "submission_channel",
   "category_id", "title", "description", "location", "status", "priority")
VALUES (
  'CC-' || to_char(current_date, 'YYYY') || '-0001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'APP',
  '20000000-0000-4000-8000-000000000001',
  'Pothole on Maple Street',
  'A pothole needs repair near the junction.',
  '142 Maple Street',
  'SUBMITTED',
  'MEDIUM'
);

INSERT INTO "service_requests"
  ("request_number", "external_requester_id", "created_by", "submission_channel",
   "category_id", "title", "description", "location", "status", "priority")
VALUES (
  'CC-' || to_char(current_date, 'YYYY') || '-0002',
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'PHONE',
  '20000000-0000-4000-8000-000000000002',
  'Streetlight reported by phone',
  'The caller reports a streetlight that is not working.',
  '12 Oak Street',
  'SUBMITTED',
  'HIGH'
);

COMMIT;
