from typing import List, Dict, Optional
import logging
from ..config import settings

logger = logging.getLogger(__name__)

class TagManager:
    """Manages tile tags and tag-related operations."""
    
    def __init__(self):
        """Initialize tag manager."""
        self.base_categories = {
            'terrain': ['ground', 'water', 'wall'],
            'object': ['tree', 'rock', 'building'],
            'attribute': ['walkable', 'solid', 'decorative']
        }
        self.tag_list = self._create_tag_list()
    
    def _create_tag_list(self) -> List[str]:
        """Create a flattened list of all possible tags."""
        tags = []
        for category, subcategories in self.base_categories.items():
            for subcategory in subcategories:
                tags.append(f"{category}.{subcategory}")
        return tags
    
    def process_predictions(self, predictions: List[float], threshold: float = None) -> List[Dict]:
        """Convert model predictions into tag data."""
        if threshold is None:
            threshold = settings.CONFIDENCE_THRESHOLD
            
        tags = []
        for idx, confidence in enumerate(predictions):
            if confidence > threshold:
                category, subcategory = self.tag_list[idx].split('.')
                tags.append({
                    'category': category,
                    'subcategory': subcategory,
                    'confidence': float(confidence)
                })
        
        # Ensure we have at least one tag if any prediction is above threshold
        if not tags and max(predictions) > threshold / 2:
            best_idx = predictions.index(max(predictions))
            category, subcategory = self.tag_list[best_idx].split('.')
            tags.append({
                'category': category,
                'subcategory': subcategory,
                'confidence': float(max(predictions))
            })
        
        return tags
    
    def calculate_statistics(self, tile_tags: List[List[Dict]]) -> Dict[str, Dict]:
        """Calculate statistics for a collection of tile tags."""
        stats: Dict[str, Dict] = {}
        
        for tags in tile_tags:
            for tag in tags:
                full_tag = f"{tag['category']}.{tag['subcategory']}"
                
                if full_tag not in stats:
                    stats[full_tag] = {
                        'tile_count': 0,
                        'total_confidence': 0.0
                    }
                
                stats[full_tag]['tile_count'] += 1
                stats[full_tag]['total_confidence'] += tag['confidence']
        
        # Calculate averages
        for tag_stats in stats.values():
            tag_stats['avg_confidence'] = (
                tag_stats['total_confidence'] / tag_stats['tile_count']
            )
            del tag_stats['total_confidence']
        
        return stats
    
    def find_similar_tags(
        self,
        source_tags: List[Dict],
        target_tags_list: List[List[Dict]],
        min_confidence: float = 0.7
    ) -> List[int]:
        """Find indices of tiles with similar tags."""
        similar_indices = []
        
        # Filter source tags by confidence
        high_conf_source = [
            tag for tag in source_tags
            if tag['confidence'] >= min_confidence
        ]
        
        if not high_conf_source:
            return []
        
        # Compare with each target
        for idx, target_tags in enumerate(target_tags_list):
            for source_tag in high_conf_source:
                matching_tag = next(
                    (t for t in target_tags
                     if (t['category'] == source_tag['category'] and
                         t['subcategory'] == source_tag['subcategory'] and
                         t['confidence'] >= min_confidence)),
                    None
                )
                
                if matching_tag:
                    similar_indices.append(idx)
                    break
        
        return similar_indices
    
    def get_categories(self) -> Dict[str, List[str]]:
        """Get all available categories and subcategories."""
        return self.base_categories.copy()
    
    def validate_tag(self, category: str, subcategory: str) -> bool:
        """Validate if a category-subcategory pair is valid."""
        return (
            category in self.base_categories and
            subcategory in self.base_categories[category]
        ) 