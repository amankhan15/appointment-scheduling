from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import DbSession
from app.api.dependencies import get_current_user
from app.db.models import Appointment, AppointmentStatus, ProviderProfile, User
from app.schemas.appointments import AppointmentCreate, AppointmentResponse, AppointmentReschedule
from app.services.audit_service import record_audit
from fastapi import Depends
from typing import Annotated

router = APIRouter(prefix="/appointments", tags=["appointments"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _ensure_customer(user: User) -> None:
    if user.role.value != "CUSTOMER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only customers can book appointments")


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(request: AppointmentCreate, db: DbSession, current_user: CurrentUser) -> Appointment:
    _ensure_customer(current_user)
    if db.get(ProviderProfile, request.provider_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    appointment = Appointment(
        customer_id=current_user.id,
        provider_id=request.provider_id,
        start_datetime=request.start_datetime,
        end_datetime=request.end_datetime,
        status=AppointmentStatus.CONFIRMED,
        notes=request.notes,
    )
    db.add(appointment)
    try:
        db.flush()
        record_audit(db, action="APPOINTMENT_BOOKED", user_id=current_user.id, appointment_id=appointment.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appointment slot is unavailable") from exc
    db.refresh(appointment)
    return appointment


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(db: DbSession, current_user: CurrentUser) -> list[Appointment]:
    query = select(Appointment)
    if current_user.role.value == "CUSTOMER":
        query = query.where(Appointment.customer_id == current_user.id)
    elif current_user.role.value == "PROVIDER":
        profile = db.scalar(select(ProviderProfile).where(ProviderProfile.user_id == current_user.id))
        if profile is None:
            return []
        query = query.where(Appointment.provider_id == profile.id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unsupported role")
    return list(db.scalars(query.order_by(Appointment.start_datetime)).all())


@router.post("/{appointment_id}/cancel", response_model=AppointmentResponse)
def cancel_appointment(
    appointment_id: int, db: DbSession, current_user: CurrentUser
) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    if appointment.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment access denied")
    if appointment.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appointment cannot be cancelled")
    appointment.status = AppointmentStatus.CANCELLED
    record_audit(db, action="APPOINTMENT_CANCELLED", user_id=current_user.id, appointment_id=appointment.id)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
def reschedule_appointment(
    appointment_id: int,
    request: AppointmentReschedule,
    db: DbSession,
    current_user: CurrentUser,
) -> Appointment:
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    if appointment.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment access denied")
    if appointment.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appointment cannot be rescheduled")
    appointment.start_datetime = request.start_datetime
    appointment.end_datetime = request.end_datetime
    record_audit(db, action="APPOINTMENT_RESCHEDULED", user_id=current_user.id, appointment_id=appointment.id)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appointment slot is unavailable") from exc
    db.refresh(appointment)
    return appointment
