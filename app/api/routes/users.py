from fastapi import APIRouter
from sqlalchemy import select

from app.api.dependencies import DbSession, get_current_user
from app.db.models import User
from app.schemas.auth import UserResponse
from app.db.models import CustomerProfile
from app.schemas.profiles import CustomerProfileRequest, CustomerProfileResponse
from fastapi import Depends
from typing import Annotated

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.get("/me/profile", response_model=CustomerProfileResponse)
def get_my_profile(db: DbSession, current_user: Annotated[User, Depends(get_current_user)]) -> CustomerProfile:
    profile = db.scalar(select(CustomerProfile).where(CustomerProfile.user_id == current_user.id))
    if profile is None:
        profile = CustomerProfile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "name": current_user.name,
        "email": current_user.email,
        "gender": profile.gender,
        "age": profile.age,
        "weight_kg": profile.weight_kg,
        "medical_notes": profile.medical_notes,
    }


@router.put("/me/profile", response_model=CustomerProfileResponse)
def update_my_profile(
    request: CustomerProfileRequest,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
) -> CustomerProfile:
    profile = db.scalar(select(CustomerProfile).where(CustomerProfile.user_id == current_user.id))
    if profile is None:
        profile = CustomerProfile(user_id=current_user.id)
        db.add(profile)
    for key, value in request.model_dump().items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "name": current_user.name,
        "email": current_user.email,
        "gender": profile.gender,
        "age": profile.age,
        "weight_kg": profile.weight_kg,
        "medical_notes": profile.medical_notes,
    }
