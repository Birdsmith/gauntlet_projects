/// <reference types="@mapeditor/tiled-api" />

import { TagData, TagStatistics } from './api/ApiClient';
import { TagManager } from './TagManager';

export class TileTagger {
    private tagManager: TagManager;

    constructor() {
        this.tagManager = new TagManager();
    }

    /**
     * Store tags for a tile
     */
    public storeTags(tile: Tile, tags: TagData[]): void {
        this.tagManager.storeTileAnalysis(tile, {
            tile_id: tile.id.toString(),
            tags: tags
        });
    }

    /**
     * Find similar tiles in a tileset
     */
    public findSimilarTiles(tile: Tile, tileset: Tileset, minConfidence: number = 0.7): Tile[] {
        const targetTiles = tileset.tiles.filter(t => t !== tile);
        const similarIndices = this.tagManager.findSimilarTiles(tile, targetTiles, minConfidence);
        return similarIndices.map(idx => targetTiles[idx]);
    }

    /**
     * Get tag statistics for a tileset
     */
    public getTagStatistics(tileset: Tileset): Record<string, TagStatistics> {
        return this.tagManager.getTilesetStatistics(tileset);
    }
} 