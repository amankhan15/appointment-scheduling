from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.db.models import Appointment, AppointmentStatus, ProviderProfile, User, UserRole
from app.main import app


@pytest.mark.parametrize("request_count", [10, 25, 50])
def test_concurrent_booking_creates_one_active_appointment(request_count: int) -> None:
    db = SessionLocal()
    db.query(ProviderProfile).where(
        ~ProviderProfile.user_id.in_(select(User.id))
    ).delete(synchronize_session=False)
    db.commit()
    provider_user = User(
        name="Concurrent Provider",
        email=f"concurrent-provider-{uuid4()}@example.com",
        password_hash=hash_password("ProviderPassword1"),
        role=UserRole.PROVIDER,
    )
    customer = User(
        name="Concurrent Customer",
        email=f"concurrent-customer-{uuid4()}@example.com",
        password_hash=hash_password("CustomerPassword1"),
        role=UserRole.CUSTOMER,
    )
    db.add_all([provider_user, customer])
    db.flush()
    profile = ProviderProfile(user_id=provider_user.id, name="Concurrent Provider")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    customer_id = customer.id
    provider_id = profile.id
    db.close()

    token = _create_token(customer_id)
    slot_date = datetime(2100 + (uuid4().int % 800), 1 + (uuid4().int % 12), 1 + (uuid4().int % 20), 10)
    payload = {
        "provider_id": provider_id,
        "start_datetime": slot_date.isoformat(),
        "end_datetime": slot_date.replace(minute=30).isoformat(),
    }

    def book() -> int:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/appointments",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            return response.status_code

    with ThreadPoolExecutor(max_workers=request_count) as executor:
        statuses = list(executor.map(lambda _: book(), range(request_count)))

    db = SessionLocal()
    active_appointments = list(
        db.scalars(
            select(Appointment).where(
                Appointment.provider_id == provider_id,
                Appointment.start_datetime == datetime.fromisoformat(payload["start_datetime"]),
                Appointment.status != AppointmentStatus.CANCELLED,
            )
        ).all()
    )
    db.query(Appointment).where(Appointment.provider_id == provider_id).delete(
        synchronize_session=False
    )
    db.query(ProviderProfile).where(ProviderProfile.id == provider_id).delete(
        synchronize_session=False
    )
    db.query(User).where(User.id.in_([provider_user.id, customer_id])).delete(
        synchronize_session=False
    )
    db.commit()
    db.close()

    assert statuses.count(201) == 1, statuses
    assert statuses.count(409) == request_count - 1, statuses
    assert len(active_appointments) == 1, active_appointments


def _create_token(user_id: int) -> str:
    from app.db.database import SessionLocal
    from app.core.security import create_access_token

    db = SessionLocal()
    user = db.get(User, user_id)
    token = create_access_token(user)
    db.close()
    return token
