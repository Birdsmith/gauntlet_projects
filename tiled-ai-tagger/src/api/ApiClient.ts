/**
 * Client for communicating with the AI Tagger server.
 */
import { ApiError } from './ApiError';
import { configManager } from '../config';
import { TagManager } from '../TagManager';

export interface TagData {
    category: string;
    subcategory: string;
    confidence: number;
}

export interface TileAnalysisResponse {
    tile_id: string;
    tags: TagData[];
}

export interface TagStatistics {
    tile_count: number;
    avg_confidence: number;
}

export class ApiClient {
    private baseUrl: string;
    private controller: AbortController;
    private tagManager: TagManager;

    constructor() {
        this.baseUrl = configManager.getConfig().serverUrl;
        this.controller = new AbortController();
        this.tagManager = new TagManager();
    }

    /**
     * Convert a Tiled tile image to a Blob for upload.
     */
    private async tileToBlob(tile: Tile): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = tile.image();
            if (!img) {
                reject(new ApiError('No image available for tile', 'tileToBlob'));
                return;
            }

            // If it's already a Blob/File, return it
            if (img instanceof Blob) {
                resolve(img);
                return;
            }

            // Convert image to blob
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new ApiError('Could not get canvas context', 'tileToBlob'));
                return;
            }

            ctx.drawImage(img, 0, 0);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new ApiError('Failed to convert image to blob', 'tileToBlob'));
            }, 'image/png');
        });
    }

    /**
     * Make an API request with error handling.
     */
    private async makeRequest<T>(
        endpoint: string,
        options: RequestInit
    ): Promise<T> {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                signal: this.controller.signal
            });

            if (!response.ok) {
                throw await ApiError.fromResponse(response, endpoint);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            if (error instanceof Error) {
                throw ApiError.fromError(error, endpoint);
            }
            throw new ApiError('Unknown error occurred', endpoint);
        }
    }

    /**
     * Analyze a single tile.
     */
    async analyzeTile(tile: Tile): Promise<TileAnalysisResponse> {
        const formData = new FormData();
        const blob = await this.tileToBlob(tile);
        formData.append('tile_image', blob, 'tile.png');
        formData.append('tile_id', tile.id.toString());

        const result = await this.makeRequest<TileAnalysisResponse>('/analyze/tile', {
            method: 'POST',
            body: formData
        });

        // Store results in tile properties
        this.tagManager.storeTileAnalysis(tile, result);
        return result;
    }

    /**
     * Analyze multiple tiles in a tileset.
     */
    async analyzeTileset(tiles: Tile[]): Promise<TileAnalysisResponse[]> {
        const formData = new FormData();
        
        // Add each tile image to form data
        for (let i = 0; i < tiles.length; i++) {
            const blob = await this.tileToBlob(tiles[i]);
            formData.append('tiles', blob, `tile_${i}.png`);
        }

        const results = await this.makeRequest<TileAnalysisResponse[]>('/analyze/tileset', {
            method: 'POST',
            body: formData
        });

        // Store results in tile properties
        for (let i = 0; i < tiles.length; i++) {
            this.tagManager.storeTileAnalysis(tiles[i], results[i]);
        }

        return results;
    }

    /**
     * Get tag statistics for a tileset.
     */
    getStatistics(tileset: Tileset): Record<string, TagStatistics> {
        return this.tagManager.getTilesetStatistics(tileset);
    }

    /**
     * Find tiles similar to a given tile.
     */
    findSimilarTiles(
        sourceTile: Tile,
        targetTiles: Tile[],
        minConfidence: number = 0.7
    ): number[] {
        return this.tagManager.findSimilarTiles(sourceTile, targetTiles, minConfidence);
    }

    /**
     * Get available tag categories.
     */
    async getCategories(): Promise<Record<string, string[]>> {
        return this.makeRequest<Record<string, string[]>>('/categories', {
            method: 'GET'
        });
    }

    /**
     * Update the server URL.
     */
    public updateServerUrl(url: string): void {
        this.baseUrl = url;
        configManager.updateConfig({ serverUrl: url });
    }

    /**
     * Reset the server URL to default.
     */
    public resetServerUrl(): void {
        configManager.resetConfig();
        this.baseUrl = configManager.getConfig().serverUrl;
    }

    /**
     * Cancel any ongoing requests.
     */
    cancelRequests(): void {
        this.controller.abort();
        this.controller = new AbortController();
    }
} 