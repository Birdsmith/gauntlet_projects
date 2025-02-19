/// <reference types="@mapeditor/tiled-api" />

import { ApiClient, TileAnalysisResponse } from './api/ApiClient';
import { ApiError } from './api/ApiError';
import { SettingsDialog } from './SettingsDialog';
import { ServerManager } from './ServerManager';

// Initialize components
const serverManager = ServerManager.getInstance();
const api = new ApiClient();
const settings = new SettingsDialog(api);

// Store analysis results
let currentTilesetResults: TileAnalysisResponse[] = [];

// Register plugin actions
const analyzeTileset = tiled.registerAction("AnalyzeTileset", async () => {
    if (!tiled.activeAsset || !('tiles' in tiled.activeAsset)) {
        tiled.alert("Please open a tileset first!");
        return;
    }

    // Ensure server is running
    if (!serverManager.isRunning()) {
        try {
            await serverManager.startServer();
        } catch (error) {
            tiled.alert("Failed to start AI Tagger server. Please check the error log.");
            return;
        }
    }

    const tileset = tiled.activeAsset as Tileset;
    const totalTiles = tileset.tiles.length;

    try {
        tiled.alert(`Analyzing ${totalTiles} tiles... This may take a moment.`);
        
        // Analyze tileset
        currentTilesetResults = await api.analyzeTileset(tileset.tiles);
        
        // Store tags in tile properties
        for (const result of currentTilesetResults) {
            const tile = tileset.tiles.find(t => t.id.toString() === result.tile_id);
            if (tile) {
                tile.setProperty("ai_tags", JSON.stringify(result.tags));
            }
        }
        
        tiled.alert(`Analysis complete! Processed ${totalTiles} tiles.`);
    } catch (error) {
        if (error instanceof ApiError) {
            tiled.alert(error.getUserMessage());
            tiled.log(error.getDetailedMessage());
        } else {
            tiled.alert('An unexpected error occurred.');
            tiled.log(`Error analyzing tileset: ${error}`);
        }
        api.cancelRequests();
    }
});

const showTagStats = tiled.registerAction("ShowTagStats", async () => {
    if (!tiled.activeAsset || !('tiles' in tiled.activeAsset)) {
        tiled.alert("Please open a tileset first!");
        return;
    }

    if (currentTilesetResults.length === 0) {
        tiled.alert("Please analyze the tileset first!");
        return;
    }

    // Ensure server is running
    if (!serverManager.isRunning()) {
        try {
            await serverManager.startServer();
        } catch (error) {
            tiled.alert("Failed to start AI Tagger server. Please check the error log.");
            return;
        }
    }

    try {
        const tileset = tiled.activeAsset as Tileset;
        const stats = await api.getStatistics(tileset);
        
        let statsText = "Tag Statistics:\n\n";
        for (const [tag, data] of Object.entries(stats)) {
            statsText += `${tag}:\n`;
            statsText += `  Tiles: ${data.tile_count}\n`;
            statsText += `  Avg. Confidence: ${data.avg_confidence.toFixed(2)}\n\n`;
        }

        tiled.alert(statsText, "Tag Statistics");
    } catch (error) {
        if (error instanceof ApiError) {
            tiled.alert(error.getUserMessage());
            tiled.log(error.getDetailedMessage());
        } else {
            tiled.alert('An unexpected error occurred.');
            tiled.log(`Error getting statistics: ${error}`);
        }
        api.cancelRequests();
    }
});

const findSimilarTiles = tiled.registerAction("FindSimilarTiles", async () => {
    if (!tiled.activeAsset || !('tiles' in tiled.activeAsset)) {
        tiled.alert("Please select a tile first!");
        return;
    }

    const tileset = tiled.activeAsset as Tileset;
    const selectedTiles = tileset.selectedTiles;
    
    if (!selectedTiles || selectedTiles.length === 0) {
        tiled.alert("Please select a tile first!");
        return;
    }

    // Ensure server is running
    if (!serverManager.isRunning()) {
        try {
            await serverManager.startServer();
        } catch (error) {
            tiled.alert("Failed to start AI Tagger server. Please check the error log.");
            return;
        }
    }

    try {
        const sourceTile = selectedTiles[0];
        const targetTiles = tileset.tiles.filter(t => t !== sourceTile);
        
        const similarIndices = await api.findSimilarTiles(sourceTile, targetTiles);
        
        if (similarIndices.length > 0) {
            // Convert indices to actual tiles
            const similarTiles = similarIndices.map(idx => targetTiles[idx]);
            tileset.selectedTiles = similarTiles;
            tiled.alert(`Found ${similarTiles.length} similar tiles!`);
        } else {
            tiled.alert("No similar tiles found.");
        }
    } catch (error) {
        if (error instanceof ApiError) {
            tiled.alert(error.getUserMessage());
            tiled.log(error.getDetailedMessage());
        } else {
            tiled.alert('An unexpected error occurred.');
            tiled.log(`Error finding similar tiles: ${error}`);
        }
        api.cancelRequests();
    }
});

const showSettings = tiled.registerAction("ShowSettings", () => {
    settings.show();
});

const resetSettings = tiled.registerAction("ResetSettings", () => {
    settings.reset();
});

// Set action properties
analyzeTileset.text = "Analyze Current Tileset";
showTagStats.text = "Show Tag Statistics";
findSimilarTiles.text = "Find Similar Tiles";
showSettings.text = "Settings";
resetSettings.text = "Reset Settings";

// Add actions to menu
tiled.extendMenu("AI Tagger", [
    { action: "AnalyzeTileset", before: "ShowTagStats" },
    { action: "ShowTagStats", before: "FindSimilarTiles" },
    { action: "FindSimilarTiles" },
    { separator: true },
    { action: "ShowSettings" },
    { action: "ResetSettings" }
]);

// Clean up resources when the plugin is unloaded
const cleanupAction = tiled.registerAction("CleanupAITagger", () => {
    serverManager.stopServer();
});

// Hide the cleanup action from menus
cleanupAction.visible = false; 