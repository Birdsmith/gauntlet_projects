from typing import Any, Dict, Optional
import time
from collections import OrderedDict
import hashlib
import json
from PIL import Image
import io
from .config import settings

class CacheManager:
    """Manages caching of analysis results."""
    
    def __init__(self):
        """Initialize the cache with LRU eviction policy."""
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.enable_cache = settings.ENABLE_CACHE
        self.cache_ttl = settings.CACHE_TTL
        self.max_cache_size = settings.MAX_CACHE_SIZE
    
    def _generate_key(self, image: Image.Image) -> str:
        """Generate a cache key from an image."""
        # Convert image to bytes
        img_bytes = io.BytesIO()
        image.save(img_bytes, format='PNG')
        img_bytes = img_bytes.getvalue()
        
        # Generate hash
        return hashlib.sha256(img_bytes).hexdigest()
    
    def _generate_batch_key(self, images: list[Image.Image]) -> str:
        """Generate a cache key for a batch of images."""
        # Combine individual image hashes
        hashes = [self._generate_key(img) for img in images]
        return hashlib.sha256(''.join(hashes).encode()).hexdigest()
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value from the cache if it exists and is not expired."""
        if not self.enable_cache or key not in self.cache:
            return None
            
        entry = self.cache[key]
        if time.time() - entry['timestamp'] > self.cache_ttl:
            # Entry expired
            del self.cache[key]
            return None
            
        # Move to end (most recently used)
        self.cache.move_to_end(key)
        return entry['value']
    
    def set(self, key: str, value: Any) -> None:
        """Set a value in the cache with timestamp."""
        if not self.enable_cache:
            return
            
        # If cache is full, remove oldest entry
        if len(self.cache) >= self.max_cache_size:
            self.cache.popitem(last=False)
        
        self.cache[key] = {
            'value': value,
            'timestamp': time.time()
        }
    
    def get_image_result(self, image: Image.Image) -> Optional[Any]:
        """Get cached result for an image."""
        key = self._generate_key(image)
        return self.get(key)
    
    def set_image_result(self, image: Image.Image, result: Any) -> None:
        """Cache result for an image."""
        key = self._generate_key(image)
        self.set(key, result)
    
    def get_batch_result(self, images: list[Image.Image]) -> Optional[Any]:
        """Get cached result for a batch of images."""
        key = self._generate_batch_key(images)
        return self.get(key)
    
    def set_batch_result(self, images: list[Image.Image], result: Any) -> None:
        """Cache result for a batch of images."""
        key = self._generate_batch_key(images)
        self.set(key, result)
    
    def clear(self) -> None:
        """Clear all cached entries."""
        self.cache.clear()
    
    def remove_expired(self) -> None:
        """Remove all expired entries."""
        current_time = time.time()
        expired_keys = [
            key for key, entry in self.cache.items()
            if current_time - entry['timestamp'] > self.cache_ttl
        ]
        for key in expired_keys:
            del self.cache[key] 