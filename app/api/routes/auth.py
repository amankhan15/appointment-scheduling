from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import CustomerProfile, User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.audit_service import record_audit

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: DbSession) -> TokenResponse:
    normalized_email = request.email.lower()
    if db.scalar(select(User).where(User.email == normalized_email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        name=request.name.strip(),
        email=normalized_email,
        password_hash=hash_password(request.password),
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    db.flush()
    if db.scalar(select(CustomerProfile).where(CustomerProfile.user_id == user.id)) is None:
        db.add(CustomerProfile(user_id=user.id))
    record_audit(db, action="USER_REGISTERED", user_id=user.id)
    db.commit()
    db.refresh(user)
    record_audit(db, action="LOGIN_SUCCEEDED", user_id=user.id)
    db.commit()
    return TokenResponse(access_token=create_access_token(user), user=user)


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == request.email.lower()))
    if user is None or not user.active or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=create_access_token(user), user=user)
