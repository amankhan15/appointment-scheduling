from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import DbSession, get_current_user
from app.core.config import get_settings
from app.db.models import Appointment, BlockedPeriod, ProviderProfile, ProviderSchedule, User, UserRole
from app.schemas.providers import (
    AvailabilityResponse,
    BlockedPeriodRequest,
    BlockedPeriodResponse,
    ProviderResponse,
    ScheduleRequest,
    ScheduleResponse,
    SlotResponse,
)
from app.services.slot_service import generate_available_slots
from app.services.audit_service import record_audit

router = APIRouter(prefix="/providers", tags=["providers"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _provider_for_user(db: DbSession, user: User) -> ProviderProfile:
    profile = db.scalar(select(ProviderProfile).where(ProviderProfile.user_id == user.id))
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider profile not found")
    return profile


def _require_provider_owner(profile: ProviderProfile, user: User) -> None:
    if user.role != UserRole.PROVIDER or profile.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider access denied")


def _get_provider(db: DbSession, provider_id: int) -> ProviderProfile:
    profile = db.get(ProviderProfile, provider_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return profile


@router.get("", response_model=list[ProviderResponse])
def list_providers(db: DbSession) -> list[ProviderProfile]:
    return list(db.scalars(select(ProviderProfile).order_by(ProviderProfile.name)).all())


@router.get("/{provider_id}", response_model=ProviderResponse)
def get_provider(provider_id: int, db: DbSession) -> ProviderProfile:
    return _get_provider(db, provider_id)


@router.post("/{provider_id}/schedules", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    provider_id: int,
    request: ScheduleRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ProviderSchedule:
    profile = _get_provider(db, provider_id)
    _require_provider_owner(profile, current_user)
    schedule = ProviderSchedule(provider_id=provider_id, **request.model_dump())
    db.add(schedule)
    db.flush()
    record_audit(db, action="SCHEDULE_CREATED", user_id=current_user.id, details={"schedule_id": schedule.id})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Schedule already exists") from exc
    db.refresh(schedule)
    return schedule


@router.get("/{provider_id}/schedules", response_model=list[ScheduleResponse])
def list_schedules(provider_id: int, db: DbSession) -> list[ProviderSchedule]:
    _get_provider(db, provider_id)
    query = select(ProviderSchedule).where(ProviderSchedule.provider_id == provider_id).order_by(
        ProviderSchedule.day_of_week, ProviderSchedule.start_time
    )
    return list(db.scalars(query).all())


@router.put("/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    request: ScheduleRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ProviderSchedule:
    schedule = db.get(ProviderSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    _require_provider_owner(_get_provider(db, schedule.provider_id), current_user)
    for key, value in request.model_dump().items():
        setattr(schedule, key, value)
    record_audit(db, action="SCHEDULE_UPDATED", user_id=current_user.id, details={"schedule_id": schedule.id})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Schedule already exists") from exc
    db.refresh(schedule)
    return schedule


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(schedule_id: int, db: DbSession, current_user: CurrentUser) -> None:
    schedule = db.get(ProviderSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    _require_provider_owner(_get_provider(db, schedule.provider_id), current_user)
    db.delete(schedule)
    record_audit(db, action="SCHEDULE_DELETED", user_id=current_user.id, details={"schedule_id": schedule_id})
    db.commit()


@router.post(
    "/{provider_id}/blocked-periods",
    response_model=BlockedPeriodResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_blocked_period(
    provider_id: int,
    request: BlockedPeriodRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> BlockedPeriod:
    profile = _get_provider(db, provider_id)
    _require_provider_owner(profile, current_user)
    blocked_period = BlockedPeriod(provider_id=provider_id, **request.model_dump())
    db.add(blocked_period)
    db.flush()
    record_audit(
        db,
        action="BLOCKED_PERIOD_CREATED",
        user_id=current_user.id,
        details={"blocked_period_id": blocked_period.id},
    )
    db.commit()
    db.refresh(blocked_period)
    return blocked_period


@router.get("/{provider_id}/blocked-periods", response_model=list[BlockedPeriodResponse])
def list_blocked_periods(provider_id: int, db: DbSession) -> list[BlockedPeriod]:
    _get_provider(db, provider_id)
    query = select(BlockedPeriod).where(BlockedPeriod.provider_id == provider_id).order_by(
        BlockedPeriod.start_datetime
    )
    return list(db.scalars(query).all())


@router.delete("/blocked-periods/{blocked_period_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blocked_period(
    blocked_period_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    blocked_period = db.get(BlockedPeriod, blocked_period_id)
    if blocked_period is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked period not found")
    _require_provider_owner(_get_provider(db, blocked_period.provider_id), current_user)
    db.delete(blocked_period)
    record_audit(
        db,
        action="BLOCKED_PERIOD_DELETED",
        user_id=current_user.id,
        details={"blocked_period_id": blocked_period_id},
    )
    db.commit()


@router.get("/{provider_id}/availability", response_model=AvailabilityResponse)
def get_availability(
    provider_id: int,
    db: DbSession,
    target_date: date = Query(..., description="Date for which available slots are requested"),
) -> AvailabilityResponse:
    profile = _get_provider(db, provider_id)
    schedules = list(db.scalars(select(ProviderSchedule).where(ProviderSchedule.provider_id == profile.id)).all())
    blocked_periods = list(
        db.scalars(select(BlockedPeriod).where(BlockedPeriod.provider_id == profile.id)).all()
    )
    appointments = list(db.scalars(select(Appointment).where(Appointment.provider_id == profile.id)).all())
    slots = generate_available_slots(
        target_date,
        schedules,
        blocked_periods,
        appointments,
        default_duration_minutes=get_settings().appointment_duration_minutes,
    )
    return AvailabilityResponse(
        provider_id=provider_id,
        date=target_date,
        slots=[SlotResponse(start_datetime=slot.start_datetime, end_datetime=slot.end_datetime) for slot in slots],
    )
