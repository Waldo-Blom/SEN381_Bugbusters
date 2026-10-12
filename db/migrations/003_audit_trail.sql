-- Please note that this was updated on neon db at around 9:50 on 12 October

BEGIN;

ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'STATUS_CHANGED';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'REQUEST_ASSIGNED';

CREATE OR REPLACE FUNCTION reject_admin_audit_log_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log is append-only; % is not permitted', TG_OP
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_append_only ON admin_audit_log;
CREATE TRIGGER admin_audit_log_append_only
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_log_mutations();
DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_truncate
    BEFORE TRUNCATE ON admin_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION reject_admin_audit_log_mutations();

COMMIT;
