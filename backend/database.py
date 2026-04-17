import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pymongo import MongoClient
import redis

Base = declarative_base()

from models.sql_models import User, Project, Experiment

# ── Connection Status Tracking ──────────────────────────────────────────
CONNECTION_STATUS = {
    'sql': False,
    'mongodb': False,
    'redis': False,
}

# ── 1. SQL Database (MySQL with SQLite fallback) ──────────────────────────
MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://gnn_user:gnn_password@127.0.0.1:3344/gnn_db")
SQLITE_URL = "sqlite:///./gnn_insight.db"

engine = None
try:
    # Try MySQL first
    engine = create_engine(MYSQL_URL, pool_pre_ping=True, pool_recycle=3600)
    # Test connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        conn.commit()
    CONNECTION_STATUS['sql'] = True
    print("✓ MySQL connection successful")
    DB_TYPE = "MySQL"
except Exception as e:
    print(f"⚠ MySQL connection failed: {e}")
    print("  Falling back to SQLite...")
    try:
        engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
        CONNECTION_STATUS['sql'] = True
        print("✓ SQLite connection successful")
        DB_TYPE = "SQLite"
    except Exception as e2:
        print(f"✗ CRITICAL: Both MySQL and SQLite failed: {e2}")
        print("  Database operations will fail!", file=sys.stderr)
        DB_TYPE = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None

def init_db():
    """Initialize database schema."""
    if engine is None:
        print("✗ Cannot initialize database: no connection available", file=sys.stderr)
        return False
    
    try:
        Base.metadata.create_all(bind=engine)
        print(f"✓ Database schema initialized ({DB_TYPE})")
        return True
    except Exception as e:
        print(f"✗ Database initialization failed: {e}", file=sys.stderr)
        return False

def get_db():
    """Get database session."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized - no SQL connection available")
    
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── 2. MongoDB (for flexible JSON storage) ──────────────────────────────
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/")

mongo_client = None
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo_client.server_info()
    CONNECTION_STATUS['mongodb'] = True
    print("✓ MongoDB connection successful")
except Exception as e:
    print(f"⚠ MongoDB connection failed: {e}")
    mongo_client = None

mongo_db = mongo_client["gnn_insight"] if mongo_client else None
mongo_experiments = mongo_db["experiments"] if mongo_db else None

# ── 3. Redis (for caching & sessions) ─────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_client = None
try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False, 
                                       socket_connect_timeout=5, socket_keepalive=True)
    redis_client.ping()
    CONNECTION_STATUS['redis'] = True
    print("✓ Redis connection successful")
except Exception as e:
    print(f"⚠ Redis connection failed: {e}")
    redis_client = None

# ── Health Check Functions ──────────────────────────────────────────────
def get_connection_status():
    """Return current connection status."""
    return CONNECTION_STATUS.copy()

def is_database_ready():
    """Check if at least SQL database is available."""
    return CONNECTION_STATUS['sql']

def is_redis_available():
    """Check if Redis is available."""
    return CONNECTION_STATUS['redis']

def is_mongodb_available():
    """Check if MongoDB is available."""
    return CONNECTION_STATUS['mongodb']

if __name__ == "__main__":
    init_db()
    print("\nConnection Status:", get_connection_status())
