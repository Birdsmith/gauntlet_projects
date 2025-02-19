"""
Tile Tagger Plugin for Tiled Map Editor
Provides AI-powered automatic tile tagging and management capabilities.
"""

import os
import json
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import time
import functools
from typing import Dict, List
import gc
from .tag_manager import TagManager
from .model_manager import ModelManager

# Performance monitoring decorator
def profile_performance(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        start_memory = torch.cuda.memory_allocated() if torch.cuda.is_available() else 0
        
        result = func(*args, **kwargs)
        
        end_time = time.time()
        end_memory = torch.cuda.memory_allocated() if torch.cuda.is_available() else 0
        
        print(f"{func.__name__} execution time: {end_time - start_time:.2f}s")
        print(f"Memory usage: {(end_memory - start_memory) / 1024**2:.2f}MB")
        
        return result
    return wrapper

# Plugin metadata
PLUGIN_NAME = "Tile Tagger"
PLUGIN_VERSION = "0.1.0"
PLUGIN_AUTHOR = "Birdsmith"

class TileTagger:
    """Main plugin class for tile tagging functionality."""
    
    def __init__(self):
        # Base categories that can apply to any tile
        self.base_categories = {
            # Terrain types
            "terrain": [
                "ground", "water", "vegetation", "mountain", "road",
                "wall", "floor", "ceiling", "platform"
            ],
            # Material types
            "material": [
                "dirt", "grass", "stone", "wood", "metal", "sand",
                "snow", "ice", "crystal", "brick", "concrete"
            ],
            # Object types
            "object": [
                "tree", "rock", "bush", "flower", "building", "decoration",
                "furniture", "container", "door", "window", "fence"
            ],
            # Visual characteristics
            "visual": [
                "light", "dark", "colorful", "plain", "detailed", "simple",
                "natural", "artificial", "damaged", "pristine"
            ],
            # Gameplay attributes
            "attribute": [
                "solid", "walkable", "climbable", "dangerous", "interactive",
                "collectible", "decorative", "animated"
            ]
        }
        
        self.model_manager = ModelManager()
        # Calculate total number of possible tags
        total_tags = sum(len(subcats) for subcats in self.base_categories.values())
        self.model = self.model_manager.load_model(total_tags)
        self.transform = self._setup_transforms()
        self.tag_manager = TagManager()
        self.batch_size = 16
        self._prediction_cache: Dict[str, List[Dict]] = {}
        
        # Create flattened tag list for model predictions
        self.tag_list = self._create_tag_list()
    
    def _create_tag_list(self):
        """Create a flattened list of all possible tags."""
        tags = []
        for category, subcategories in self.base_categories.items():
            for subcat in subcategories:
                tags.append(f"{category}.{subcat}")
        return tags
    
    def _get_relevant_tags(self, predictions, threshold=0.3):
        """Get relevant tags based on predictions with adaptive thresholding."""
        tags = []
        pred_values = predictions.tolist()
        
        # Calculate adaptive threshold based on prediction distribution
        mean_conf = sum(pred_values) / len(pred_values)
        std_conf = (sum((x - mean_conf) ** 2 for x in pred_values) / len(pred_values)) ** 0.5
        adaptive_threshold = min(max(mean_conf + std_conf, threshold), 0.8)
        
        # Get tags above threshold
        for idx, conf in enumerate(pred_values):
            if conf > adaptive_threshold:
                category, subcategory = self.tag_list[idx].split('.')
                tags.append({
                    'category': category,
                    'subcategory': subcategory,
                    'confidence': float(conf)
                })
        
        # Ensure we have at least some tags
        if not tags and max(pred_values) > threshold:
            best_idx = pred_values.index(max(pred_values))
            category, subcategory = self.tag_list[best_idx].split('.')
            tags.append({
                'category': category,
                'subcategory': subcategory,
                'confidence': float(max(pred_values))
            })
        
        return tags
    
    def _setup_transforms(self):
        """Set up image transformations for model input."""
        return transforms.Compose([
            transforms.Resize((64, 64)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    def get_tag_categories(self):
        """Return the list of available tag categories."""
        return self.tag_list
    
    @profile_performance
    def analyze_tile(self, tile):
        """Analyze a single tile and store its tags with performance optimization."""
        # Check cache first
        tile_id = str(id(tile))
        if tile_id in self._prediction_cache:
            return self._prediction_cache[tile_id]
        
        # Get tile image
        tile_image = tile.image()
        if not isinstance(tile_image, Image.Image):
            tile_image = Image.open(tile_image).convert('RGB')
        
        # Transform and predict
        with torch.no_grad():
            img_tensor = self.transform(tile_image).unsqueeze(0)
            if torch.cuda.is_available():
                img_tensor = img_tensor.cuda()
                self.model = self.model.cuda()
            
            predictions = torch.sigmoid(self.model(img_tensor))
            if torch.cuda.is_available():
                predictions = predictions.cpu()
        
        # Get relevant tags using adaptive thresholding
        tags = self._get_relevant_tags(predictions[0])
        
        # Cache the results
        self._prediction_cache[tile_id] = tags
        
        # Store tags in tile properties
        self.tag_manager.add_tags(tile, tags)
        
        # Clear GPU memory if needed
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        return tags
    
    @profile_performance
    def analyze_tileset_batch(self, tileset):
        """Analyze tiles in batches for better performance."""
        if not hasattr(tileset, 'tiles'):
            return
        
        tiles = tileset.tiles
        batches = [tiles[i:i + self.batch_size] for i in range(0, len(tiles), self.batch_size)]
        
        for batch in batches:
            # Prepare batch tensors
            batch_images = []
            for tile in batch:
                tile_image = tile.image()
                if not isinstance(tile_image, Image.Image):
                    tile_image = Image.open(tile_image).convert('RGB')
                batch_images.append(self.transform(tile_image))
            
            # Stack images into a single tensor
            batch_tensor = torch.stack(batch_images)
            if torch.cuda.is_available():
                batch_tensor = batch_tensor.cuda()
                self.model = self.model.cuda()
            
            # Predict in batch
            with torch.no_grad():
                predictions = torch.sigmoid(self.model(batch_tensor))
                if torch.cuda.is_available():
                    predictions = predictions.cpu()
            
            # Process predictions and update tiles
            for tile, pred in zip(batch, predictions):
                tags = self._get_relevant_tags(pred)
                self.tag_manager.add_tags(tile, tags)
                self._prediction_cache[str(id(tile))] = tags
            
            # Clear GPU memory after each batch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
    
    def clear_cache(self):
        """Clear the prediction cache."""
        self._prediction_cache.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()
    
    def get_tile_tags(self, tile):
        """Get tags for a specific tile."""
        return self.tag_manager.get_tags(tile)
    
    def find_similar_tiles(self, tile, min_confidence=0.7):
        """Find tiles with similar tags in the same tileset."""
        if not hasattr(tile, 'tileset'):
            return []
            
        tags = self.get_tile_tags(tile)
        similar_tiles = set()
        
        for tag in tags:
            if tag['confidence'] >= min_confidence:
                tiles = self.tag_manager.find_tiles_by_tag(
                    tile.tileset,
                    tag['category'],
                    min_confidence=min_confidence
                )
                similar_tiles.update(tiles)
        
        # Remove the query tile itself
        similar_tiles.discard(tile)
        return list(similar_tiles)
    
    def get_tag_statistics(self, tileset):
        """Get statistics about tag usage in a tileset."""
        return self.tag_manager.get_tag_statistics(tileset)

def register_tiled_plugin():
    """Register the plugin with Tiled."""
    tagger = TileTagger()
    
    # Register custom actions
    tiled.registerAction("AnalyzeTileset", "Analyze Current Tileset", 
                        lambda: analyze_current_tileset(tagger))
    
    tiled.registerAction("ShowTagStats", "Show Tag Statistics",
                        lambda: show_tag_statistics(tagger))
    
    tiled.registerAction("FindSimilarTiles", "Find Similar Tiles",
                        lambda: find_similar_tiles(tagger))
    
    tiled.registerAction("CheckTilesetInfo", "Check Tileset Information",
                        lambda: check_tileset_info(tagger))
    
    # Add to Tileset menu
    tiled.extendMenu("Tileset", [
        { "action": "CheckTilesetInfo" },
        { "action": "AnalyzeTileset" },
        { "action": "ShowTagStats" },
        { "action": "FindSimilarTiles" },
    ])

def analyze_current_tileset(tagger):
    """Analyze all tiles in the current tileset using batch processing."""
    if not tiled.activeAsset or not hasattr(tiled.activeAsset, 'tiles'):
        tiled.alert("Please open a tileset first!")
        return
    
    tileset = tiled.activeAsset
    total_tiles = len(tileset.tiles)
    
    tiled.alert(f"Analyzing {total_tiles} tiles... This may take a moment.")
    
    # Clear any existing cache
    tagger.clear_cache()
    
    # Use batch processing for better performance
    tagger.analyze_tileset_batch(tileset)
    
    tiled.alert(f"Analysis complete! Processed {total_tiles} tiles.")

def show_tag_statistics(tagger):
    """Show statistics about tag usage in the current tileset."""
    if not tiled.activeAsset or not hasattr(tiled.activeAsset, 'tiles'):
        tiled.alert("Please open a tileset first!")
        return
    
    stats = tagger.get_tag_statistics(tiled.activeAsset)
    
    # Format statistics for display
    stats_text = "Tag Statistics:\n\n"
    for tag, data in stats.items():
        stats_text += f"{tag}:\n"
        stats_text += f"  Tiles: {data['tile_count']}\n"
        stats_text += f"  Avg. Confidence: {data['avg_confidence']:.2f}\n\n"
    
    tiled.alert(stats_text, "Tag Statistics")

def find_similar_tiles(tagger):
    """Find tiles with similar tags to the selected tile."""
    if not tiled.activeAsset or not hasattr(tiled.activeAsset, 'selectedTiles'):
        tiled.alert("Please select a tile first!")
        return
    
    selected = tiled.activeAsset.selectedTiles
    if not selected:
        tiled.alert("Please select a tile first!")
        return
    
    tile = selected[0]
    similar_tiles = tagger.find_similar_tiles(tile)
    
    if similar_tiles:
        # Highlight similar tiles
        tiled.activeAsset.selectedTiles = similar_tiles
        tiled.alert(f"Found {len(similar_tiles)} similar tiles!")
    else:
        tiled.alert("No similar tiles found.")

def check_tileset_info(tagger):
    """Display information about the currently loaded tileset."""
    if not tiled.activeAsset or not hasattr(tiled.activeAsset, 'tiles'):
        tiled.alert("No tileset is currently open. Please open a tileset first!")
        return
    
    tileset = tiled.activeAsset
    info_text = "Current Tileset Information:\n\n"
    info_text += f"Name: {tileset.name}\n"
    info_text += f"Total Tiles: {len(tileset.tiles)}\n"
    
    if hasattr(tileset, 'tileWidth') and hasattr(tileset, 'tileHeight'):
        info_text += f"Tile Size: {tileset.tileWidth}x{tileset.tileHeight} pixels\n"
    
    # Check if any tiles are already tagged
    tagged_count = 0
    for tile in tileset.tiles:
        if tile.property("ai_tags"):
            tagged_count += 1
    
    info_text += f"\nTagged Tiles: {tagged_count}/{len(tileset.tiles)}\n"
    
    if tagged_count > 0:
        info_text += "\nNote: Some tiles already have AI tags. Running analysis again will update existing tags."
    
    tiled.alert(info_text, "Tileset Information") 