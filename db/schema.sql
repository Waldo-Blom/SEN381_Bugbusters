CREATE SCHEMA "public";
CREATE TYPE "user_type" AS ENUM('REQUESTER', 'STAFF', 'MANAGER', 'ADMIN');
CREATE TYPE "request_status" AS ENUM('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');
CREATE TYPE "priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "comment_type" AS ENUM('ACTION', 'RESOLUTION', 'NOTE', 'UPDATE');
CREATE TYPE "action_type" AS ENUM('USER_CREATED', 'USER_MODIFIED', 'USER_DEACTIVATED', 'DEPARTMENT_CREATED', 'DEPARTMENT_MODIFIED', 'STAFF_ASSIGNED', 'STAFF_REMOVED', 'MANAGER_CREATED', 'MANAGER_REMOVED', 'CATEGORY_CREATED', 'CATEGORY_MODIFIED', 'CONTACT_ACCESS_REQUESTED', 'CONTACT_ACCESS_APPROVED', 'CONTACT_ACCESS_REJECTED', 'CONTACT_ACCESS_REVOKED', 'STATUS_CHANGED', 'REQUEST_ASSIGNED');
CREATE TYPE "target_type" AS ENUM('USER', 'DEPARTMENT', 'CATEGORY', 'ASSIGNMENT', 'REQUEST');
CREATE TABLE "admin_audit_log" (
	"audit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"admin_id" uuid NOT NULL,
	"action_type" action_type NOT NULL,
	"target_type" target_type NOT NULL,
	"target_id" uuid NOT NULL,
	"changed_data" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE FUNCTION reject_admin_audit_log_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'admin_audit_log is append-only; % is not permitted', TG_OP
		USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER admin_audit_log_append_only
	BEFORE UPDATE OR DELETE ON admin_audit_log
	FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_log_mutations();
CREATE TRIGGER admin_audit_log_no_truncate
	BEFORE TRUNCATE ON admin_audit_log
	FOR EACH STATEMENT EXECUTE FUNCTION reject_admin_audit_log_mutations();
CREATE TABLE "departments" (
	"department_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(100) NOT NULL CONSTRAINT "departments_name_key" UNIQUE,
	"description" text,
	"manager_id" uuid NOT NULL CONSTRAINT "departments_manager_id_key" UNIQUE,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
CREATE TABLE "external_requesters" (
	"external_requester_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"email" varchar(255),
	"phone" varchar(15),
	"preferred_contact_method" varchar(20),
	"created_at" timestamp DEFAULT now()
);
CREATE TABLE "request_assignment_history" (
	"assignment_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_id" uuid NOT NULL,
	"assigned_to_staff_id" uuid,
	"assigned_by_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
CREATE TABLE "request_attachments" (
	"attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"file_extension_type" varchar(10) NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "request_categories" (
	"category_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(100) NOT NULL CONSTRAINT "request_categories_name_key" UNIQUE,
	"description" text,
	"department_id" uuid NOT NULL,
	"target_resolution_time" interval,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "request_comments" (
	"comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_id" uuid NOT NULL,
	"commented_by" uuid NOT NULL,
	"comment_type" comment_type DEFAULT 'NOTE' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"is_deleted" boolean DEFAULT false
);
CREATE TABLE "request_status_history" (
	"status_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_id" uuid NOT NULL,
	"old_status" request_status NOT NULL,
	"new_status" request_status NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "service_requests" (
	"request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_number" varchar(20) NOT NULL CONSTRAINT "service_requests_request_number_key" UNIQUE,
	"requester_id" uuid,
	"external_requester_id" uuid,
	"created_by" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(255),
	"status" request_status DEFAULT 'SUBMITTED' NOT NULL,
	"priority" priority DEFAULT 'MEDIUM',
	"assigned_staff_id" uuid,
	"assigned_at" timestamp,
	"assigned_by" uuid,
	"contact_information_approved" boolean DEFAULT false NOT NULL,
	"contact_approved_by" uuid,
	"contact_approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"expected_completion_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"overdue_flag" boolean,
	CONSTRAINT "service_requests_exactly_one_requester" CHECK ((((requester_id IS NOT NULL) AND (external_requester_id IS NULL)) OR ((requester_id IS NULL) AND (external_requester_id IS NOT NULL))))
);
CREATE TABLE "staff_assignments" (
	"staff_assignment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"staff_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL CONSTRAINT "users_email_key" UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(15),
	"user_type" user_type NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp
);
CREATE UNIQUE INDEX "admin_audit_log_pkey" ON "admin_audit_log" ("audit_id");
CREATE UNIQUE INDEX "departments_manager_id_key" ON "departments" ("manager_id");
CREATE UNIQUE INDEX "departments_name_key" ON "departments" ("name");
CREATE UNIQUE INDEX "departments_pkey" ON "departments" ("department_id");
CREATE UNIQUE INDEX "external_requesters_pkey" ON "external_requesters" ("external_requester_id");
CREATE INDEX "request_assignment_history_assigned_at_idx" ON "request_assignment_history" ("assigned_at");
CREATE UNIQUE INDEX "request_assignment_history_pkey" ON "request_assignment_history" ("assignment_history_id");
CREATE INDEX "request_assignment_history_request_id_idx" ON "request_assignment_history" ("request_id");
CREATE UNIQUE INDEX "request_attachments_pkey" ON "request_attachments" ("attachment_id");
CREATE INDEX "request_attachments_request_id_idx" ON "request_attachments" ("request_id");
CREATE INDEX "request_attachments_uploaded_by_idx" ON "request_attachments" ("uploaded_by");
CREATE UNIQUE INDEX "request_categories_name_key" ON "request_categories" ("name");
CREATE UNIQUE INDEX "request_categories_pkey" ON "request_categories" ("category_id");
CREATE INDEX "request_comments_commented_by_idx" ON "request_comments" ("commented_by");
CREATE INDEX "request_comments_created_at_idx" ON "request_comments" ("created_at");
CREATE UNIQUE INDEX "request_comments_pkey" ON "request_comments" ("comment_id");
CREATE INDEX "request_comments_request_id_idx" ON "request_comments" ("request_id");
CREATE INDEX "request_status_history_changed_at_idx" ON "request_status_history" ("changed_at");
CREATE UNIQUE INDEX "request_status_history_pkey" ON "request_status_history" ("status_history_id");
CREATE INDEX "request_status_history_request_id_idx" ON "request_status_history" ("request_id");
CREATE INDEX "service_requests_assigned_staff_id_idx" ON "service_requests" ("assigned_staff_id");
CREATE INDEX "service_requests_category_id_idx" ON "service_requests" ("category_id");
CREATE INDEX "service_requests_created_at_idx" ON "service_requests" ("created_at");
CREATE INDEX "service_requests_created_by_idx" ON "service_requests" ("created_by");
CREATE INDEX "service_requests_expected_completion_at_idx" ON "service_requests" ("expected_completion_at");
CREATE INDEX "service_requests_external_requester_id_idx" ON "service_requests" ("external_requester_id");
CREATE INDEX "service_requests_overdue_flag_idx" ON "service_requests" ("overdue_flag");
CREATE UNIQUE INDEX "service_requests_pkey" ON "service_requests" ("request_id");
CREATE UNIQUE INDEX "service_requests_request_number_key" ON "service_requests" ("request_number");
CREATE INDEX "service_requests_requester_id_idx" ON "service_requests" ("requester_id");
CREATE INDEX "service_requests_status_idx" ON "service_requests" ("status");
CREATE UNIQUE INDEX "staff_assignments_pkey" ON "staff_assignments" ("staff_assignment_id");
CREATE UNIQUE INDEX "staff_assignments_staff_id_department_id_idx" ON "staff_assignments" ("staff_id","department_id");
CREATE UNIQUE INDEX "unique_active_staff_assignment" ON "staff_assignments" ("staff_id");
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "users_pkey" ON "users" ("user_id");
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "performs" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id");
ALTER TABLE "departments" ADD CONSTRAINT "manages" FOREIGN KEY ("manager_id") REFERENCES "users"("user_id");
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assigned_by_staff_history" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("user_id");
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assigned_to_staff_history" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "users"("user_id");
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "assignment_history" FOREIGN KEY ("request_id") REFERENCES "service_requests"("request_id") ON DELETE CASCADE;
ALTER TABLE "request_attachments" ADD CONSTRAINT "has_attachment" FOREIGN KEY ("request_id") REFERENCES "service_requests"("request_id") ON DELETE CASCADE;
ALTER TABLE "request_attachments" ADD CONSTRAINT "uploads" FOREIGN KEY ("uploaded_by") REFERENCES "users"("user_id");
ALTER TABLE "request_categories" ADD CONSTRAINT "routes" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id");
ALTER TABLE "request_comments" ADD CONSTRAINT "comments" FOREIGN KEY ("request_id") REFERENCES "service_requests"("request_id") ON DELETE CASCADE;
ALTER TABLE "request_comments" ADD CONSTRAINT "writes" FOREIGN KEY ("commented_by") REFERENCES "users"("user_id");
ALTER TABLE "request_status_history" ADD CONSTRAINT "changes" FOREIGN KEY ("changed_by") REFERENCES "users"("user_id");
ALTER TABLE "request_status_history" ADD CONSTRAINT "history" FOREIGN KEY ("request_id") REFERENCES "service_requests"("request_id") ON DELETE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "assigned_by_staff" FOREIGN KEY ("assigned_by") REFERENCES "users"("user_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "assigned_staff" FOREIGN KEY ("assigned_staff_id") REFERENCES "users"("user_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "categorizes" FOREIGN KEY ("category_id") REFERENCES "request_categories"("category_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "contact_approved_by" FOREIGN KEY ("contact_approved_by") REFERENCES "users"("user_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "created_by_user" FOREIGN KEY ("created_by") REFERENCES "users"("user_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "external_requester" FOREIGN KEY ("external_requester_id") REFERENCES "external_requesters"("external_requester_id");
ALTER TABLE "service_requests" ADD CONSTRAINT "requester" FOREIGN KEY ("requester_id") REFERENCES "users"("user_id");
ALTER TABLE "staff_assignments" ADD CONSTRAINT "assigned_by_manager" FOREIGN KEY ("assigned_by") REFERENCES "users"("user_id");
ALTER TABLE "staff_assignments" ADD CONSTRAINT "has" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id");
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff" FOREIGN KEY ("staff_id") REFERENCES "users"("user_id");