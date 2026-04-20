from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .api.routes import router
from .core.config import settings
from .db.session import init_db


def create_app() -> FastAPI:
    app = FastAPI(
        title="WebsiteClaw API",
        version="0.1.0",
        description="Website collection and Feishu sync MVP",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()

    app.include_router(router, prefix="/api")
    register_frontend_routes(app)
    return app


def register_frontend_routes(app: FastAPI) -> None:
    dist_dir = settings.frontend_dist_dir
    index_file = dist_dir / "index.html"

    if not index_file.exists():
        return

    @app.get("/", include_in_schema=False)
    def serve_frontend_root() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend_app(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404)

        target = (dist_dir / full_path).resolve()
        try:
            target.relative_to(dist_dir)
        except ValueError:
            return FileResponse(index_file)

        if target.is_file():
            return FileResponse(target)
        return FileResponse(index_file)


app = create_app()
