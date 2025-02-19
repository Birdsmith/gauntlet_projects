"""
Tag Management System for Tile Tagger Plugin.
Handles storage, retrieval, and searching of tile tags using Tiled's custom properties.
"""

import json
from typing import List, Dict, Optional

class TagManager:
    """Manages tile tags using Tiled's custom properties system."""
    
    def __init__(self):
        """Initialize tag manager."""
        self.TAG_PROPERTY = "ai_tags"  # Property name for storing tags
    
    def add_tags(self, tile, tags: List[Dict]) -> None:
        """Add or update tags for a tile using custom properties."""
        # Format tags for storage
        formatted_tags = []
        for tag in tags:
            formatted_tag = {
                'category': tag['category'],
                'subcategory': tag['subcategory'],
                'confidence': tag['confidence'],
                'full_tag': f"{tag['category']}.{tag['subcategory']}"
            }
            formatted_tags.append(formatted_tag)
        
        tile.setProperty(self.TAG_PROPERTY, json.dumps(formatted_tags))
    
    def remove_tags(self, tile, categories: Optional[List[str]] = None) -> None:
        """Remove specific tags or all tags from a tile."""
        if categories is None:
            # Remove all tags
            tile.setProperty(self.TAG_PROPERTY, None)
        else:
            # Remove specific categories
            current_tags = self.get_tags(tile)
            updated_tags = [
                tag for tag in current_tags 
                if tag['category'] not in categories
            ]
            
            if updated_tags:
                tile.setProperty(self.TAG_PROPERTY, json.dumps(updated_tags))
            else:
                tile.setProperty(self.TAG_PROPERTY, None)
    
    def get_tags(self, tile) -> List[Dict]:
        """Get all tags for a specific tile."""
        tags_json = tile.property(self.TAG_PROPERTY)
        return json.loads(tags_json) if tags_json else []
    
    def find_tiles_by_tag(self, tileset, tag_query: str, min_confidence: float = 0.0) -> List:
        """Find all tiles in a tileset with a specific tag pattern.
        
        tag_query can be:
        - Full tag: "category.subcategory"
        - Category only: "category.*"
        - Subcategory only: "*.subcategory"
        """
        matching_tiles = []
        category_filter, subcategory_filter = tag_query.split('.') if '.' in tag_query else (tag_query, '*')
        
        for tile in tileset.tiles:
            tags = self.get_tags(tile)
            for tag in tags:
                matches_category = (category_filter == '*' or 
                                  tag['category'] == category_filter)
                matches_subcategory = (subcategory_filter == '*' or 
                                     tag['subcategory'] == subcategory_filter)
                
                if (matches_category and matches_subcategory and 
                    tag['confidence'] >= min_confidence):
                    matching_tiles.append(tile)
                    break
        
        return matching_tiles
    
    def get_all_tags(self, tileset) -> Dict[str, List[str]]:
        """Get a dictionary of all unique tag categories and their subcategories in a tileset."""
        categories = {}
        
        for tile in tileset.tiles:
            tags = self.get_tags(tile)
            for tag in tags:
                category = tag['category']
                subcategory = tag['subcategory']
                
                if category not in categories:
                    categories[category] = set()
                categories[category].add(subcategory)
        
        # Convert sets to sorted lists
        return {cat: sorted(list(subcats)) for cat, subcats in categories.items()}
    
    def get_tag_statistics(self, tileset) -> Dict:
        """Get statistics about tag usage in a tileset."""
        stats = {}
        
        for tile in tileset.tiles:
            tags = self.get_tags(tile)
            for tag in tags:
                full_tag = f"{tag['category']}.{tag['subcategory']}"
                confidence = tag['confidence']
                
                if full_tag not in stats:
                    stats[full_tag] = {
                        'tile_count': 0,
                        'total_confidence': 0.0,
                        'category': tag['category'],
                        'subcategory': tag['subcategory']
                    }
                
                stats[full_tag]['tile_count'] += 1
                stats[full_tag]['total_confidence'] += confidence
        
        # Calculate averages and clean up
        for tag_stats in stats.values():
            total = tag_stats['total_confidence']
            count = tag_stats['tile_count']
            tag_stats['avg_confidence'] = total / count
            del tag_stats['total_confidence']
        
        return stats 