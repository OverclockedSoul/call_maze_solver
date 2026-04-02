from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.agent import router as agent_router
from app.api.routes.calls import router as calls_router
from app.api.routes.telnyx import router as telnyx_router
from app.core.logging import configure_logging
from app.core.settings import get_settings
from app.db.base import Base
from app.db.session import engine
from app.websocket.browser import router as browser_ws_router


settings = get_settings()
configure_logging()

frontend_origins = {
    settings.frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app = FastAPI(title="Call Maze Solver API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def create_tables_for_local_dev() -> None:
    Base.metadata.create_all(bind=engine)


app.include_router(agent_router)
app.include_router(calls_router)
app.include_router(telnyx_router)
app.include_router(browser_ws_router)
