from dataclasses import dataclass
from datetime import date, datetime, timedelta
from time import perf_counter
from typing import Iterable

from app.db.models import Appointment, AppointmentStatus, BlockedPeriod, ProviderSchedule


@dataclass(frozen=True)
class AppointmentSlot:
    start_datetime: datetime
    end_datetime: datetime


def generate_available_slots(
    target_date: date,
    schedules: Iterable[ProviderSchedule],
    blocked_periods: Iterable[BlockedPeriod],
    appointments: Iterable[Appointment],
    *,
    now: datetime | None = None,
    default_duration_minutes: int = 30,
) -> list[AppointmentSlot]:
    if default_duration_minutes <= 0:
        raise ValueError("Appointment duration must be positive")

    weekday = target_date.weekday()
    duration = timedelta(minutes=default_duration_minutes)
    blocked_ranges = [
        (period.start_datetime, period.end_datetime) for period in blocked_periods
    ]
    booked_ranges = [
        (appointment.start_datetime, appointment.end_datetime)
        for appointment in appointments
        if appointment.status != AppointmentStatus.CANCELLED
    ]
    current_time = now or datetime.now()
    if current_time.tzinfo is not None:
        current_time = current_time.replace(tzinfo=None)
    slots: list[AppointmentSlot] = []

    for schedule in schedules:
        if schedule.active is False or schedule.day_of_week != weekday:
            continue
        if schedule.end_time <= schedule.start_time:
            raise ValueError("Schedule end time must be after start time")

        cursor = datetime.combine(target_date, schedule.start_time)
        schedule_end = datetime.combine(target_date, schedule.end_time)
        while cursor + duration <= schedule_end:
            slot_end = cursor + duration
            if slot_end > current_time and not _overlaps(cursor, slot_end, blocked_ranges):
                if not _overlaps(cursor, slot_end, booked_ranges):
                    slots.append(AppointmentSlot(cursor, slot_end))
            cursor += duration

    return sorted(set(slots), key=lambda slot: slot.start_datetime)


def _overlaps(start: datetime, end: datetime, ranges: Iterable[tuple[datetime, datetime]]) -> bool:
    return any(start < range_end and end > range_start for range_start, range_end in ranges)


def measure_slot_generation(*args, **kwargs) -> tuple[list[AppointmentSlot], float]:
    started = perf_counter()
    slots = generate_available_slots(*args, **kwargs)
    return slots, perf_counter() - started
