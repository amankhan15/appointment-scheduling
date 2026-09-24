from datetime import date, datetime, time

import pytest

from app.db.models import Appointment, AppointmentStatus, BlockedPeriod, ProviderSchedule
from app.services.slot_service import generate_available_slots


def test_generates_slots_and_excludes_booked_and_blocked_ranges() -> None:
    target_date = date(2030, 1, 7)  # Monday
    schedule = ProviderSchedule(
        day_of_week=0, start_time=time(9), end_time=time(11), active=True
    )
    blocked = BlockedPeriod(
        start_datetime=datetime(2030, 1, 7, 9, 30),
        end_datetime=datetime(2030, 1, 7, 10),
    )
    booked = Appointment(
        start_datetime=datetime(2030, 1, 7, 10, 30),
        end_datetime=datetime(2030, 1, 7, 11),
        status=AppointmentStatus.CONFIRMED,
    )

    slots = generate_available_slots(
        target_date,
        [schedule],
        [blocked],
        [booked],
        now=datetime(2030, 1, 1),
    )

    assert [(slot.start_datetime, slot.end_datetime) for slot in slots] == [
        (datetime(2030, 1, 7, 9), datetime(2030, 1, 7, 9, 30)),
        (datetime(2030, 1, 7, 10), datetime(2030, 1, 7, 10, 30)),
    ]


def test_cancelled_appointment_does_not_block_slot() -> None:
    appointment = Appointment(
        start_datetime=datetime(2030, 1, 7, 9),
        end_datetime=datetime(2030, 1, 7, 9, 30),
        status=AppointmentStatus.CANCELLED,
    )
    slots = generate_available_slots(
        date(2030, 1, 7),
        [ProviderSchedule(day_of_week=0, start_time=time(9), end_time=time(10))],
        [],
        [appointment],
        now=datetime(2030, 1, 1),
    )

    assert slots[0].start_datetime == datetime(2030, 1, 7, 9)


def test_invalid_schedule_is_rejected() -> None:
    with pytest.raises(ValueError, match="after start"):
        generate_available_slots(
            date(2030, 1, 7),
            [ProviderSchedule(day_of_week=0, start_time=time(10), end_time=time(9))],
            [],
            [],
            now=datetime(2030, 1, 1),
        )


def test_slots_in_the_past_are_excluded() -> None:
    slots = generate_available_slots(
        date(2030, 1, 7),
        [ProviderSchedule(day_of_week=0, start_time=time(9), end_time=time(10))],
        [],
        [],
        now=datetime(2030, 1, 7, 9, 30),
    )

    assert [slot.start_datetime for slot in slots] == [datetime(2030, 1, 7, 9, 30)]
