-- ==========================================
-- CIVICCONNECT DATABASE SETUP
-- ==========================================
-- Full SQL script for pgAdmin
-- Instructions:
-- 1. Open pgAdmin
-- 2. Create a new database named the same as what it is called in the .env file 
-- 3. Open Query Tool
-- 4. Copy and paste this entire script
-- 5. Click Execute (or press F5)

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE "user_type" AS ENUM (
  'REQUESTER',
  'STAFF',
  'MANAGER',
  'ADMIN'
);

CREATE TYPE "request_status" AS ENUM (
  'SUBMITTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED'
);

CREATE TYPE "priority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

CREATE TYPE "comment_type" AS ENUM (
  'ACTION',
  'RESOLUTION',
  'NOTE',
  'UPDATE'
);

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

CREATE TYPE "target_type" AS ENUM (
  'USER',
  'DEPARTMENT',
  'CATEGORY',
  'ASSIGNMENT'
);

-- ==========================================
-- CORE / USER MANAGEMENT DOMAIN
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
  "created_at" timestamp NOT NULL DEFAULT (now()),
  "updated_at" timestamp DEFAULT (now()),
  "last_login_at" timestamp
);

CREATE TABLE "departments" (
  "department_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) UNIQUE NOT NULL,
  "description" text,
  "manager_id" uuid NOT NULL UNIQUE,   -- UNIQUE enforces one-to-one with users
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT (now()),
  "updated_at" timestamp DEFAULT (now())
);

CREATE TABLE "staff_assignments" (
  "staff_assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "assigned_by" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "assigned_at" timestamp NOT NULL DEFAULT (now()),
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
  "created_at" timestamp NOT NULL DEFAULT (now())
);

-- ==========================================
-- OPERATIONAL / REQUEST WORKFLOW DOMAIN
-- ==========================================
CREATE TABLE "service_requests" (
  "request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_number" varchar(20) UNIQUE NOT NULL,
  "requester_id" uuid NOT NULL,
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
  "created_at" timestamp NOT NULL DEFAULT (now()),
  "updated_at" timestamp DEFAULT (now()),
  "expected_completion_at" timestamp,
  "resolved_at" timestamp,
  "closed_at" timestamp,
  "overdue_flag" boolean
);

CREATE TABLE "request_attachments" (
  "attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_path" varchar(500) NOT NULL,
  "file_size_bytes" integer NOT NULL,
  "file_extension_type" varchar(10) NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "uploaded_at" timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE "request_status_history" (
  "status_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "old_status" request_status NOT NULL,
  "new_status" request_status NOT NULL,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE "request_assignment_history" (
  "assignment_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "assigned_to_staff_id" uuid,
  "assigned_by_id" uuid NOT NULL,
  "assigned_at" timestamp NOT NULL DEFAULT (now()),
  "removed_at" timestamp
);

CREATE TABLE "request_comments" (
  "comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "commented_by" uuid NOT NULL,
  "comment_type" comment_type NOT NULL DEFAULT 'NOTE',
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT (now()),
  "updated_at" timestamp,
  "is_deleted" boolean DEFAULT false
);

-- ==========================================
-- AUDIT DOMAIN
-- ==========================================
CREATE TABLE "admin_audit_log" (
  "audit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" uuid NOT NULL,
  "action_type" action_type NOT NULL,
  "target_type" target_type NOT NULL,
  "target_id" uuid NOT NULL,
  "changed_data" json,
  "created_at" timestamp NOT NULL DEFAULT (now())
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE UNIQUE INDEX ON "staff_assignments" ("staff_id", "department_id");

-- Enforce "one active department per staff member"
CREATE UNIQUE INDEX "unique_active_staff_assignment" ON "staff_assignments" ("staff_id") WHERE "is_active" = true;

CREATE INDEX ON "service_requests" ("requester_id");

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
-- FOREIGN KEY CONSTRAINTS
-- ==========================================

-- User & Department Relationships
ALTER TABLE "departments" ADD CONSTRAINT "manages" FOREIGN KEY ("manager_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff" FOREIGN KEY ("staff_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "staff_assignments" ADD CONSTRAINT "assigned_by_manager" FOREIGN KEY ("assigned_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

-- Request Category Relationships
ALTER TABLE "request_categories" ADD CONSTRAINT "routes" FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "staff_assignments" ADD CONSTRAINT "has" FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

-- Service Request Relationships
ALTER TABLE "service_requests" ADD CONSTRAINT "requester" FOREIGN KEY ("requester_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_requests" ADD CONSTRAINT "assigned_staff" FOREIGN KEY ("assigned_staff_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_requests" ADD CONSTRAINT "assigned_by_staff" FOREIGN KEY ("assigned_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_requests" ADD CONSTRAINT "contact_approved_by" FOREIGN KEY ("contact_approved_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_requests" ADD CONSTRAINT "categorizes" FOREIGN KEY ("category_id") REFERENCES "request_categories" ("category_id") DEFERRABLE INITIALLY IMMEDIATE;

-- Request Child Tables (Cascade Deletes)
ALTER TABLE "request_attachments" ADD CONSTRAINT "has_attachment" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_status_history" ADD CONSTRAINT "history" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assignment_history" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_comments" ADD CONSTRAINT "comments" FOREIGN KEY ("request_id") REFERENCES "service_requests" ("request_id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- User Actions on Requests
ALTER TABLE "request_attachments" ADD CONSTRAINT "uploads" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_status_history" ADD CONSTRAINT "changes" FOREIGN KEY ("changed_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assigned_to_staff_history" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assigned_by_staff_history" FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "request_comments" ADD CONSTRAINT "writes" FOREIGN KEY ("commented_by") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

-- Audit Log Relationships
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "performs" FOREIGN KEY ("admin_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;