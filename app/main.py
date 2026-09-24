from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import admin, appointments, auth, providers, users
from app.core.config import get_settings
from app.db.database import Base, check_database_connection, engine
from app.db.models import entities  # noqa: F401


@asynccontextmanager
async def lifespan(_: FastAPI):
    if get_settings().app_env == "development":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=get_settings().app_name,
    version="0.1.0",
    description="A cloud appointment scheduling API built for DevOps evaluation.",
    lifespan=lifespan,
)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(appointments.router)
app.include_router(providers.router)
app.include_router(admin.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/ready", tags=["health"])
def readiness() -> dict[str, str]:
    if not check_database_connection():
        return {"status": "not_ready"}
    return {"status": "ready"}
