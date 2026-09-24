from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.database import SessionLocal
from app.db.models import ProviderProfile, User, UserRole
from app.main import app
from app.core.security import hash_password


client = TestClient(app)


def test_active_slot_cannot_be_booked_twice_and_can_be_rebooked_after_cancel() -> None:
    provider_email = f"provider-{uuid4()}@example.com"
    customer_email = f"appointment-customer-{uuid4()}@example.com"
    db = SessionLocal()
    provider_user = User(
        name="Test Provider",
        email=provider_email,
        password_hash=hash_password("ProviderPassword1"),
        role=UserRole.PROVIDER,
    )
    db.add(provider_user)
    db.flush()
    profile = ProviderProfile(user_id=provider_user.id, name="Test Provider")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    provider_id = profile.id
    db.close()

    registration = client.post(
        "/auth/register",
        json={"name": "Booking Customer", "email": customer_email, "password": "CustomerPassword1"},
    )
    token = registration.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "provider_id": provider_id,
        "start_datetime": "2030-02-04T10:00:00",
        "end_datetime": "2030-02-04T10:30:00",
    }

    first = client.post("/appointments", json=payload, headers=headers)
    second = client.post("/appointments", json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 409

    cancelled = client.post(f"/appointments/{first.json()['id']}/cancel", headers=headers)
    replacement = client.post("/appointments", json=payload, headers=headers)

    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    assert replacement.status_code == 201

    cleanup = SessionLocal()
    cleanup.query(User).filter(User.email.in_([provider_email, customer_email])).delete(
        synchronize_session=False
    )
    cleanup.commit()
    cleanup.close()
