import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditRecord


def record_audit(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    appointment_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> AuditRecord:
    record = AuditRecord(
        user_id=user_id,
        action=action,
        appointment_id=appointment_id,
        details=json.dumps(details, default=str) if details else None,
    )
    db.add(record)
    return record
