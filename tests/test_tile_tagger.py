"""Tests for the Tile Tagger plugin."""

import pytest
from PIL import Image
import torch
import json
from src.tile_tagger import TileTagger

class MockTile:
    """Mock Tiled tile for testing."""
    def __init__(self, image_path=None):
        self._properties = {}
        self._image = Image.new('RGB', (32, 32), color='red') if not image_path else Image.open(image_path)
        self.tileset = None
    
    def image(self):
        return self._image
    
    def setProperty(self, name, value):
        self._properties[name] = value
    
    def property(self, name):
        return self._properties.get(name)

class MockTileset:
    """Mock Tiled tileset for testing."""
    def __init__(self):
        self.tiles = []
        self.selectedTiles = []
        self.name = "test_tileset"

@pytest.fixture
def tagger():
    """Create a TileTagger instance for testing."""
    return TileTagger()

@pytest.fixture
def mock_tile():
    """Create a mock tile for testing."""
    tile = MockTile()
    tileset = MockTileset()
    tile.tileset = tileset
    tileset.tiles.append(tile)
    return tile

def test_model_initialization(tagger):
    """Test that the model is properly initialized."""
    assert isinstance(tagger.model, torch.nn.Module)
    assert tagger.transform is not None

def test_tag_categories(tagger):
    """Test that tag categories are properly defined."""
    categories = tagger.get_tag_categories()
    assert len(categories) > 0
    assert all(isinstance(cat, str) for cat in categories)
    assert all('.' in cat for cat in categories)  # Hierarchical format

def test_image_transformation(tagger, mock_tile):
    """Test image preprocessing pipeline."""
    # Transform image
    img_tensor = tagger.transform(mock_tile.image())
    
    # Check output shape and type
    assert isinstance(img_tensor, torch.Tensor)
    assert img_tensor.shape == (3, 64, 64)  # Should be resized to 64x64
    assert img_tensor.dtype == torch.float32

def test_tile_analysis(tagger, mock_tile):
    """Test tile analysis functionality."""
    # Analyze tile
    tags = tagger.analyze_tile(mock_tile)
    
    # Check results
    assert isinstance(tags, list)
    for tag in tags:
        assert 'category' in tag
        assert 'subcategory' in tag
        assert 'confidence' in tag
        assert isinstance(tag['confidence'], float)
        assert 0 <= tag['confidence'] <= 1
        assert tag['category'] in tagger.base_categories
        assert tag['subcategory'] in tagger.base_categories[tag['category']]
    
    # Check that tags were stored in tile properties
    stored_tags = json.loads(mock_tile.property("ai_tags"))
    assert stored_tags == tags

def test_find_similar_tiles(tagger):
    """Test finding similar tiles."""
    # Create mock tileset with multiple tiles
    tileset = MockTileset()
    tile1 = MockTile()
    tile2 = MockTile()
    tile3 = MockTile()
    
    for tile in [tile1, tile2, tile3]:
        tile.tileset = tileset
        tileset.tiles.append(tile)
    
    # Analyze all tiles
    tagger.analyze_tile(tile1)
    tagger.analyze_tile(tile2)
    tagger.analyze_tile(tile3)
    
    # Find similar tiles
    similar_tiles = tagger.find_similar_tiles(tile1)
    
    # Check results
    assert isinstance(similar_tiles, list)
    assert tile1 not in similar_tiles  # Should not include the query tile
    assert all(isinstance(t, MockTile) for t in similar_tiles)

def test_tag_statistics(tagger):
    """Test tag usage statistics."""
    # Create mock tileset with multiple tiles
    tileset = MockTileset()
    tile1 = MockTile()
    tile2 = MockTile()
    
    for tile in [tile1, tile2]:
        tile.tileset = tileset
        tileset.tiles.append(tile)
    
    # Analyze tiles
    tagger.analyze_tile(tile1)
    tagger.analyze_tile(tile2)
    
    # Get statistics
    stats = tagger.get_tag_statistics(tileset)
    
    # Check results
    assert isinstance(stats, dict)
    for category, data in stats.items():
        assert 'tile_count' in data
        assert 'avg_confidence' in data
        assert isinstance(data['tile_count'], int)
        assert isinstance(data['avg_confidence'], float)
        assert 0 <= data['avg_confidence'] <= 1 