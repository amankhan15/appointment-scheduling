from fastapi import APIRouter

from app.api.dependencies import get_current_user
from app.db.models import User
from app.schemas.auth import UserResponse
from fastapi import Depends
from typing import Annotated

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
