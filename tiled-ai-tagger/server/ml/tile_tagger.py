from typing import List, Dict, Optional, Generator, Callable
import logging
from PIL import Image
import io
from .model_manager import ModelManager
from .tag_manager import TagManager
from ..cache_manager import CacheManager
from ..config import settings

logger = logging.getLogger(__name__)

class TileTagger:
    """Main class for tile tagging operations."""
    
    def __init__(self):
        """Initialize TileTagger with its managers."""
        self.model_manager = ModelManager()
        self.tag_manager = TagManager()
        self.cache_manager = CacheManager()
    
    def analyze_tile(self, image: Image.Image, tile_id: Optional[str] = None) -> Dict:
        """Analyze a single tile image and return its tags."""
        try:
            # Check cache first
            cached_result = self.cache_manager.get_image_result(image)
            if cached_result is not None:
                logger.debug(f"Cache hit for tile {tile_id}")
                cached_result['tile_id'] = tile_id or 'unknown'
                return cached_result
            
            # Get predictions from model
            predictions = self.model_manager.analyze_image(image)
            
            # Process predictions into tags
            tags = self.tag_manager.process_predictions(predictions)
            
            result = {
                'tile_id': tile_id or 'unknown',
                'tags': tags
            }
            
            # Cache the result
            self.cache_manager.set_image_result(image, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing tile {tile_id}: {str(e)}")
            raise
    
    def analyze_tileset(
        self,
        images: List[Image.Image],
        tile_ids: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        chunk_size: Optional[int] = 100
    ) -> Generator[List[Dict], None, None]:
        """Analyze multiple tiles efficiently with progress tracking and chunking."""
        try:
            # Generate default tile IDs if none provided
            if tile_ids is None:
                tile_ids = [f"tile_{i}" for i in range(len(images))]
            
            # Process images in chunks
            total_images = len(images)
            processed = 0
            
            # Get predictions for all images with chunking
            for chunk_predictions in self.model_manager.analyze_batch(
                images,
                batch_size=16,
                progress_callback=progress_callback,
                chunk_size=chunk_size
            ):
                # Process predictions into results
                chunk_results = []
                chunk_start = processed
                chunk_size = len(chunk_predictions)
                
                for i, pred in enumerate(chunk_predictions):
                    tile_id = tile_ids[chunk_start + i]
                    tags = self.tag_manager.process_predictions(pred)
                    result = {
                        'tile_id': tile_id,
                        'tags': tags
                    }
                    chunk_results.append(result)
                
                # Cache the chunk results
                chunk_images = images[chunk_start:chunk_start + chunk_size]
                self.cache_manager.set_batch_result(chunk_images, chunk_results)
                
                processed += chunk_size
                yield chunk_results
            
        except Exception as e:
            logger.error(f"Error analyzing tileset: {str(e)}")
            raise
    
    def find_similar_tiles(
        self,
        source_image: Image.Image,
        target_images: List[Image.Image],
        min_confidence: float = 0.7,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[int]:
        """Find tiles similar to the source tile."""
        try:
            # Analyze source tile (use cache if available)
            source_result = self.analyze_tile(source_image)
            source_tags = source_result['tags']
            
            # Analyze target tiles (use cache if available)
            similar_indices = []
            processed = 0
            total = len(target_images)
            
            for chunk_results in self.analyze_tileset(
                target_images,
                progress_callback=lambda p, t: progress_callback(p, t) if progress_callback else None,
                chunk_size=100
            ):
                # Find similar tiles in this chunk
                chunk_tags = [result['tags'] for result in chunk_results]
                chunk_indices = self.tag_manager.find_similar_tags(
                    source_tags,
                    chunk_tags,
                    min_confidence
                )
                
                # Adjust indices to account for chunking
                similar_indices.extend([i + processed for i in chunk_indices])
                processed += len(chunk_results)
            
            return similar_indices
            
        except Exception as e:
            logger.error(f"Error finding similar tiles: {str(e)}")
            raise
    
    def get_tag_statistics(self, tile_tags: List[Dict]) -> Dict[str, Dict]:
        """Calculate statistics for a collection of tile tags."""
        try:
            # Extract just the tags from the tile data
            tags_list = [tile_data['tags'] for tile_data in tile_tags]
            return self.tag_manager.calculate_statistics(tags_list)
            
        except Exception as e:
            logger.error(f"Error calculating tag statistics: {str(e)}")
            raise
    
    def get_available_categories(self) -> Dict[str, List[str]]:
        """Get all available tag categories and subcategories."""
        return self.tag_manager.get_categories()
    
    def cancel_analysis(self):
        """Cancel any ongoing analysis."""
        self.model_manager.cancel_analysis()
    
    def cleanup(self):
        """Clean up resources."""
        self.model_manager.cleanup()
        self.cache_manager.remove_expired() 