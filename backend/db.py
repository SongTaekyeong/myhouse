"""SQLAlchemy 2.0 세션. mart_* 조회는 읽기 전용 세션으로 (CLAUDE.md)."""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

load_dotenv(".env.local")

DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
    f"@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_mart_session():
    """mart_* 전용 읽기 전용 세션. main.py에서 Depends(get_mart_session)으로 사용."""
    session: Session = SessionLocal()
    try:
        session.execute(text("SET TRANSACTION READ ONLY"))
        yield session
    finally:
        session.close()


def get_app_session():
    """profiles/dim_destination/users 쓰기용 세션."""
    session: Session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
