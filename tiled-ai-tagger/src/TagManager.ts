/// <reference types="@mapeditor/tiled-api" />

import { TagData, TileAnalysisResponse, TagStatistics } from './api/ApiClient';

export class TagManager {
    private readonly TAG_PROPERTY = 'ai_tags';
    private readonly ANALYSIS_DATE_PROPERTY = 'ai_analysis_date';
    private readonly CONFIDENCE_PROPERTY = 'ai_confidence';

    /**
     * Store analysis results for a tile using Tiled custom properties
     */
    public storeTileAnalysis(tile: Tile, analysis: TileAnalysisResponse): void {
        // Store the tags as a JSON string
        tile.setProperty(this.TAG_PROPERTY, JSON.stringify(analysis.tags));
        
        // Store the analysis date
        tile.setProperty(this.ANALYSIS_DATE_PROPERTY, new Date().toISOString());
        
        // Store average confidence
        const avgConfidence = analysis.tags.reduce((sum, tag) => sum + tag.confidence, 0) / analysis.tags.length;
        tile.setProperty(this.CONFIDENCE_PROPERTY, avgConfidence);
    }

    /**
     * Retrieve stored analysis for a tile
     */
    public getTileAnalysis(tile: Tile): TileAnalysisResponse | null {
        const tagsJson = tile.property(this.TAG_PROPERTY);
        if (!tagsJson) {
            return null;
        }

        try {
            const tags = JSON.parse(tagsJson as string) as TagData[];
            return {
                tile_id: tile.id.toString(),
                tags: tags
            };
        } catch {
            return null;
        }
    }

    /**
     * Check if a tile has valid stored analysis
     */
    public hasTileAnalysis(tile: Tile): boolean {
        return tile.property(this.TAG_PROPERTY) !== undefined;
    }

    /**
     * Get the date when the tile was last analyzed
     */
    public getAnalysisDate(tile: Tile): Date | null {
        const dateStr = tile.property(this.ANALYSIS_DATE_PROPERTY);
        if (!dateStr) {
            return null;
        }
        return new Date(dateStr as string);
    }

    /**
     * Calculate statistics for a tileset based on stored properties
     */
    public getTilesetStatistics(tileset: Tileset): Record<string, TagStatistics> {
        const stats: Record<string, { count: number, totalConfidence: number }> = {};

        for (const tile of tileset.tiles) {
            const analysis = this.getTileAnalysis(tile);
            if (!analysis) continue;

            for (const tag of analysis.tags) {
                const key = `${tag.category}.${tag.subcategory}`;
                if (!stats[key]) {
                    stats[key] = { count: 0, totalConfidence: 0 };
                }
                stats[key].count++;
                stats[key].totalConfidence += tag.confidence;
            }
        }

        // Convert to final format
        const result: Record<string, TagStatistics> = {};
        for (const [tag, data] of Object.entries(stats)) {
            result[tag] = {
                tile_count: data.count,
                avg_confidence: data.totalConfidence / data.count
            };
        }

        return result;
    }

    /**
     * Find tiles with similar tags in a tileset
     */
    public findSimilarTiles(
        sourceTile: Tile,
        targetTiles: Tile[],
        minConfidence: number = 0.7
    ): number[] {
        const sourceAnalysis = this.getTileAnalysis(sourceTile);
        if (!sourceAnalysis) {
            return [];
        }

        const similarIndices: number[] = [];
        const sourceTags = sourceAnalysis.tags;

        targetTiles.forEach((tile, index) => {
            const targetAnalysis = this.getTileAnalysis(tile);
            if (!targetAnalysis) return;

            // Check for tag matches
            let hasMatch = false;
            for (const sourceTag of sourceTags) {
                const matchingTag = targetAnalysis.tags.find(targetTag =>
                    targetTag.category === sourceTag.category &&
                    targetTag.subcategory === sourceTag.subcategory &&
                    targetTag.confidence >= minConfidence
                );

                if (matchingTag) {
                    hasMatch = true;
                    break;
                }
            }

            if (hasMatch) {
                similarIndices.push(index);
            }
        });

        return similarIndices;
    }

    /**
     * Clear all AI-related properties from a tile
     */
    public clearTileAnalysis(tile: Tile): void {
        tile.setProperty(this.TAG_PROPERTY, undefined);
        tile.setProperty(this.ANALYSIS_DATE_PROPERTY, undefined);
        tile.setProperty(this.CONFIDENCE_PROPERTY, undefined);
    }
} 