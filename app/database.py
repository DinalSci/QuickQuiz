import os
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, JSON
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL")

# Fix for Vercel Postgres URL format which uses postgres:// but sqlalchemy needs postgresql://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Default to SQLite if no DATABASE_URL is provided (for local testing)
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./quiz_app.db"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    pdf_name = Column(String, index=True)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # Array of options e.g. ["5", "8", "10", "11", "12"]
    correct_option_id = Column(Integer, nullable=True) # Selected answer index (0-4)
    explanation = Column(Text, nullable=True)
    is_published = Column(Boolean, default=False)

def init_db():
    Base.metadata.create_all(bind=engine)
