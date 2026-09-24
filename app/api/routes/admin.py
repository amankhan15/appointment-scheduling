from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.api.dependencies import DbSession, get_current_user
from app.db.models import Appointment, AppointmentStatus, AuditRecord, ProviderProfile, User, UserRole

router = APIRouter(prefix="/admin", tags=["admin"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")


@router.get("/summary")
def summary(db: DbSession, current_user: CurrentUser) -> dict[str, int]:
    require_admin(current_user)
    return {
        "users": db.scalar(select(func.count(User.id))) or 0,
        "providers": db.scalar(select(func.count(ProviderProfile.id))) or 0,
        "appointments": db.scalar(select(func.count(Appointment.id))) or 0,
        "confirmed": db.scalar(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.CONFIRMED)) or 0,
        "cancelled": db.scalar(select(func.count(Appointment.id)).where(Appointment.status == AppointmentStatus.CANCELLED)) or 0,
    }


@router.get("/audit")
def audit(db: DbSession, current_user: CurrentUser) -> list[dict[str, str | int | None]]:
    require_admin(current_user)
    records = db.scalars(select(AuditRecord).order_by(AuditRecord.timestamp.desc()).limit(12)).all()
    return [
        {"id": record.id, "action": record.action, "user_id": record.user_id, "timestamp": record.timestamp.isoformat(), "details": record.details}
        for record in records
    ]
