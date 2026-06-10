-- ============================================================================
-- Migration 0001 (DOWN): notifications 롤백
-- 파티션은 부모 DROP 시 CASCADE 로 함께 제거된다.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS notifications CASCADE;

DROP TYPE IF EXISTS notification_action;
DROP TYPE IF EXISTS notification_type;

COMMIT;
