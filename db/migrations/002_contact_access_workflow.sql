-- Additive migration for FR-305. Existing access requests are preserved.
BEGIN;
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_REQUESTED';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_APPROVED';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_REJECTED';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_REVOKED';
ALTER TYPE target_type ADD VALUE IF NOT EXISTS 'REQUEST';

CREATE TABLE IF NOT EXISTS request_contact_access_requests (
    contact_access_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES users(user_id),
    department_id uuid NOT NULL REFERENCES departments(department_id),
    reason text NOT NULL CHECK (length(btrim(reason)) > 0),
    status varchar(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by uuid REFERENCES users(user_id),
    reviewed_at timestamptz,
    review_note text,
    CHECK (
        (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR (status IN ('APPROVED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        OR (status = 'CANCELLED' AND reviewed_at IS NOT NULL)
    ),
    CHECK (reviewed_at IS NULL OR reviewed_at >= requested_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_access_one_pending_per_staff_request
    ON request_contact_access_requests (request_id, requested_by) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS contact_access_department_status_requested_at
    ON request_contact_access_requests (department_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS contact_access_staff_requested_at
    ON request_contact_access_requests (requested_by, requested_at DESC);
COMMIT;
