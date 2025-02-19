"""Tests for the Tag Management System."""

import pytest
import json
from src.tile_tagger.tag_manager import TagManager

class MockTile:
    """Mock Tiled tile for testing."""
    def __init__(self):
        self._properties = {}
        self.tileset = None
    
    def setProperty(self, name, value):
        self._properties[name] = value
    
    def property(self, name):
        return self._properties.get(name)

class MockTileset:
    """Mock Tiled tileset for testing."""
    def __init__(self):
        self.tiles = []
        self.name = "test_tileset"

@pytest.fixture
def tag_manager():
    """Create a TagManager instance for testing."""
    return TagManager()

@pytest.fixture
def mock_tile():
    """Create a mock tile for testing."""
    return MockTile()

@pytest.fixture
def mock_tileset():
    """Create a mock tileset with tiles for testing."""
    tileset = MockTileset()
    for _ in range(3):
        tile = MockTile()
        tile.tileset = tileset
        tileset.tiles.append(tile)
    return tileset

def test_add_and_get_tags(tag_manager, mock_tile):
    """Test adding and retrieving tags."""
    test_tags = [
        {
            'category': 'terrain',
            'subcategory': 'grass',
            'confidence': 0.9
        },
        {
            'category': 'object',
            'subcategory': 'tree',
            'confidence': 0.8
        }
    ]
    
    tag_manager.add_tags(mock_tile, test_tags)
    retrieved_tags = tag_manager.get_tags(mock_tile)
    
    assert len(retrieved_tags) == len(test_tags)
    assert all(t['category'] in [rt['category'] for rt in retrieved_tags] 
              for t in test_tags)
    assert all(t['confidence'] in [rt['confidence'] for rt in retrieved_tags] 
              for t in test_tags)

def test_remove_tags(tag_manager, mock_tile):
    """Test removing specific tags."""
    test_tags = [
        {
            'category': 'terrain',
            'subcategory': 'grass',
            'confidence': 0.9
        },
        {
            'category': 'object',
            'subcategory': 'tree',
            'confidence': 0.8
        }
    ]
    
    # Add tags
    tag_manager.add_tags(mock_tile, test_tags)
    
    # Remove one category
    tag_manager.remove_tags(mock_tile, ['terrain'])
    remaining_tags = tag_manager.get_tags(mock_tile)
    
    assert len(remaining_tags) == 1
    assert remaining_tags[0]['category'] == 'object'
    
    # Remove all tags
    tag_manager.remove_tags(mock_tile)
    assert len(tag_manager.get_tags(mock_tile)) == 0

def test_find_tiles_by_tag(tag_manager, mock_tileset):
    """Test finding tiles by tag category."""
    # Add tags to tiles
    tag_manager.add_tags(mock_tileset.tiles[0], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.9
        }
    ])
    tag_manager.add_tags(mock_tileset.tiles[1], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.7
        }
    ])
    tag_manager.add_tags(mock_tileset.tiles[2], [
        {
            'category': 'terrain',
            'subcategory': 'grass',
            'confidence': 0.8
        }
    ])
    
    # Find tiles with water
    water_tiles = tag_manager.find_tiles_by_tag(mock_tileset, 'terrain.water')
    assert len(water_tiles) == 2
    assert water_tiles[0] in mock_tileset.tiles
    assert water_tiles[1] in mock_tileset.tiles
    
    # Test confidence threshold
    high_conf_water = tag_manager.find_tiles_by_tag(mock_tileset, 'terrain.water', min_confidence=0.8)
    assert len(high_conf_water) == 1
    assert high_conf_water[0] == mock_tileset.tiles[0]

def test_get_tag_statistics(tag_manager, mock_tileset):
    """Test tag usage statistics."""
    # Add tags to tiles
    tag_manager.add_tags(mock_tileset.tiles[0], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.9
        }
    ])
    tag_manager.add_tags(mock_tileset.tiles[1], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.7
        },
        {
            'category': 'terrain',
            'subcategory': 'grass',
            'confidence': 0.8
        }
    ])
    
    stats = tag_manager.get_tag_statistics(mock_tileset)
    
    assert 'terrain.water' in stats
    assert stats['terrain.water']['tile_count'] == 2
    assert 0.7 < stats['terrain.water']['avg_confidence'] < 0.9
    
    assert 'terrain.grass' in stats
    assert stats['terrain.grass']['tile_count'] == 1
    assert stats['terrain.grass']['avg_confidence'] == 0.8

def test_get_all_tags(tag_manager, mock_tileset):
    """Test retrieving all unique tag categories."""
    # Add tags to tiles
    tag_manager.add_tags(mock_tileset.tiles[0], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.9
        },
        {
            'category': 'terrain',
            'subcategory': 'grass',
            'confidence': 0.8
        }
    ])
    tag_manager.add_tags(mock_tileset.tiles[1], [
        {
            'category': 'terrain',
            'subcategory': 'water',
            'confidence': 0.7
        },
        {
            'category': 'object',
            'subcategory': 'tree',
            'confidence': 0.85
        }
    ])
    
    all_tags = tag_manager.get_all_tags(mock_tileset)
    
    assert 'terrain' in all_tags
    assert 'object' in all_tags
    assert 'water' in all_tags['terrain']
    assert 'grass' in all_tags['terrain']
    assert 'tree' in all_tags['object'] 