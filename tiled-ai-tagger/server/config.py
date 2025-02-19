from pydantic_settings import BaseSettings
from typing import List
import os
from pathlib import Path

class Settings(BaseSettings):
    # API Settings
    API_VERSION: str = "1.0.0"
    API_TITLE: str = "Tiled AI Tagger Server"
    API_PREFIX: str = "/api"
    
    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    RELOAD: bool = True
    
    # CORS Settings
    CORS_ORIGINS: List[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]
    
    # ML Model Settings
    MODEL_DIR: Path = Path.home() / ".tiled" / "models"
    MODEL_PATH: Path = MODEL_DIR / "tile_tagger_model.pth"
    IMAGE_SIZE: int = 64
    CONFIDENCE_THRESHOLD: float = 0.5
    
    # Cache Settings
    ENABLE_CACHE: bool = True
    CACHE_TTL: int = 3600  # 1 hour
    MAX_CACHE_SIZE: int = 1000  # number of items
    
    # Rate Limiting Settings
    RATE_LIMIT_WINDOW: int = 60  # seconds
    RATE_LIMIT_MAX_REQUESTS: int = 100  # requests per window
    RATE_LIMIT_ENABLED: bool = True
    
    # Logging Settings
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        
# Create settings instance
settings = Settings()

# Ensure model directory exists
settings.MODEL_DIR.mkdir(parents=True, exist_ok=True) 