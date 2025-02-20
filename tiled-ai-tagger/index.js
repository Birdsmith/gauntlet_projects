// AI Tagger plugin for Tiled
let aiTagger = {
    name: "AI Tagger",
    version: "1.0.0",
    settings: null
};

// Base64 encoding lookup table
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Convert bytes to base64
function bytesToBase64(bytes) {
    let base64 = '';
    let i;
    for (i = 0; i < bytes.length - 2; i += 3) {
        const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        base64 += base64Chars[(chunk >> 18) & 63];
        base64 += base64Chars[(chunk >> 12) & 63];
        base64 += base64Chars[(chunk >> 6) & 63];
        base64 += base64Chars[chunk & 63];
    }
    if (i < bytes.length) {
        let chunk = bytes[i] << 16;
        if (i + 1 < bytes.length) {
            chunk |= bytes[i + 1] << 8;
        }
        base64 += base64Chars[(chunk >> 18) & 63];
        base64 += base64Chars[(chunk >> 12) & 63];
        if (i + 1 < bytes.length) {
            base64 += base64Chars[(chunk >> 6) & 63];
        } else {
            base64 += '=';
        }
        base64 += '=';
    }
    return base64;
}

// Load settings from file
function loadSettings() {
    try {
        const settingsPath = tiled.extensionsPath + "/tiled-ai-tagger/settings.json";
        const settingsFile = new TextFile(settingsPath, TextFile.ReadOnly);
        const content = settingsFile.readAll();
        settingsFile.close();
        aiTagger.settings = JSON.parse(content);
        return true;
    } catch (error) {
        tiled.error("Failed to load settings: " + error);
        aiTagger.settings = {
            openaiApiKey: "",
            batchSize: 4,
            confidenceThreshold: 0.7
        };
        return false;
    }
}

// Save settings to file
function saveSettings(settings) {
    let settingsFile = null;
    try {
        const settingsPath = tiled.extensionsPath + "/tiled-ai-tagger/settings.json";
        settingsFile = new TextFile(settingsPath, TextFile.WriteOnly);
        settingsFile.write(JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        tiled.error("Failed to save settings: " + error);
        return false;
    } finally {
        if (settingsFile) {
            settingsFile.close();
        }
    }
}

// Convert tile to base64 image
function tileToBase64(tile) {
    try {
        // Get tile image and crop to the correct sub-rectangle
        const fullImage = tile.image;
        if (!fullImage) {
            tiled.warn("No image for tile");
            return null;
        }

        // Create a copy of just the tile's portion of the image
        const tileImage = fullImage.copy(tile.imageRect);
        
        // Save the tile image to a temporary file with maximum quality settings
        const tempPath = tiled.extensionsPath + "/tiled-ai-tagger/temp_tile.png";
        tileImage.save(tempPath, "PNG", {
            compressionLevel: 0,  // No compression
            smoothing: false,     // Disable smoothing to preserve pixel art
            optimizedWrite: false // Disable optimization to preserve exact pixels
        });

        // Read the file as binary data
        const tempFile = new BinaryFile(tempPath, BinaryFile.ReadOnly);
        const imageData = tempFile.readAll();
        tempFile.close();

        // Convert binary data to base64
        const base64Data = bytesToBase64(new Uint8Array(imageData));
        return "data:image/png;base64," + base64Data;
    } catch (error) {
        tiled.error("Failed to convert tile to base64: " + error);
        return null;
    }
}

// Make OpenAI Vision API call for multiple tiles
function analyzeTileBatch(tileDataArray, callback) {
    try {
        // Validate API key
        if (!aiTagger.settings.openaiApiKey || aiTagger.settings.openaiApiKey.trim() === "") {
            tiled.error("OpenAI API key is missing or empty");
            callback(new Error("Please configure your OpenAI API key in the settings"));
            return;
        }

        // Create content array with all tiles
        const content = [
            {
                type: "text",
                text: [
                    "I will show you several pixel art tiles from a game tileset. For each tile, analyze and provide the following in JSON format.",
                    "",
                    "IMPORTANT - Directions are defined as follows:",
                    "         NORTH (top)",
                    "            ^",
                    "            |",
                    "WEST <--  TILE  --> EAST",
                    "            |",
                    "            v",
                    "        SOUTH (bottom)",
                    "",
                    "CRITICAL RELATIONSHIP BETWEEN CONNECTIONS AND WALLS:",
                    "- If a tile has no connection in a direction, it MUST have a wall or blocking element in that direction",
                    "- If a tile has a wall in a direction, it CANNOT have a connection in that direction",
                    "- Only completely open tiles (like floors or ground) should have connections in all directions",
                    "",
                    "For each tile, provide:",
                    "- terrain_type: The primary terrain or surface type. Use your judgment to identify the main terrain material or surface. Some examples include: grass, stone, water, sand, wood, metal, lava, ice - but feel free to use any appropriate terrain type you observe.",
                    "- object_type: Any distinct object or feature in the tile. Examples like tree, wall, flower are just suggestions - identify whatever object or feature you see, such as: door, window, fence, bridge, statue, torch, etc.",
                    "- color_scheme: Main colors used in the pixel art. Be specific about the colors you observe, including variations like 'dark blue', 'pale yellow', or combinations like 'red and gold'.",
                    "- game_context: Suggested game context or biome. While examples like 'forest level' or 'dungeon' are common, use any appropriate context you observe: castle interior, desert oasis, space station, underwater ruins, etc.",
                    "- connections: Describe which sides of the tile can connect to similar tiles (where movement/continuation is possible). Format as a comma-separated list using ONLY: north, south, east, west. Examples:",
                    "  - For an open floor tile: \"north,south,east,west\" (can connect in all directions)",
                    "  - For a hallway with walls north and south: \"east,west\" (can only connect left-right)",
                    "  - For a corner room with walls south and east: \"north,west\" (can only connect top-left)",
                    "  - For a dead-end with walls on three sides: \"north\" (can only connect upward)",
                    "  Remember: north=top, south=bottom, east=right, west=left",
                    "- walls: Describe which sides of the tile have solid elements that need to align with other walls. Must correspond to blocked connections. Format as a comma-separated list using ONLY: north, south, east, west. Examples:",
                    "  - For an open floor tile: \"\" (no walls, can connect all directions)",
                    "  - For a hallway: \"north,south\" (walls top and bottom, matching east-west connections)",
                    "  - For a corner room: \"south,east\" (walls bottom and right, matching north-west connections)",
                    "  - For a three-sided room: \"south,east,west\" (walls on three sides, matching north-only connection)",
                    "  Remember: Always use the cardinal directions relative to the tile's orientation (north=top, south=bottom, east=right, west=left)",
                    "- description: A brief but detailed description of what this tile represents. Be specific about notable features and arrangements you observe.",
                    "",
                    "IMPORTANT: Your response must be a valid JSON array of objects. Do NOT use markdown formatting or code blocks. Format exactly like this example, starting with [ and ending with ]:",
                    "[",
                    "  {",
                    "    \"terrain_type\": \"stone\",",
                    "    \"object_type\": \"wall\",",
                    "    \"color_scheme\": \"gray and brown\",",
                    "    \"game_context\": \"dungeon\",",
                    "    \"connections\": \"east,west\",",
                    "    \"walls\": \"north,south\",",
                    "    \"description\": \"A dungeon hallway with walls on the top and bottom sides, allowing passage from left to right\"",
                    "  }",
                    "]",
                    "",
                    "Do NOT wrap the response in ```json or any other markdown. The response should be pure JSON that can be parsed by JSON.parse() without any modifications."
                ].join("\n")
            }
        ];

        // Add each tile image to the content array
        tileDataArray.forEach((dataUrl, index) => {
            content.push({
                type: "text",
                text: `Tile ${index + 1}:`
            });
            content.push({
                type: "image_url",
                image_url: {
                    url: dataUrl
                }
            });
        });

        const xhr = new XMLHttpRequest();
        // Make the request synchronous by setting the third parameter to false
        xhr.open('POST', 'https://api.openai.com/v1/chat/completions', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + aiTagger.settings.openaiApiKey.trim());

        tiled.log("Making API request to OpenAI...");
        tiled.log("URL: https://api.openai.com/v1/chat/completions");
        tiled.log("Model: gpt-4-turbo");
        tiled.log("Number of images in batch: " + tileDataArray.length);

        const requestBody = {
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes small pictures of pixel art map tiles used in level editors. You always respond with pure JSON without any markdown formatting."
                },
                {
                    role: "user",
                    content: content
                }
            ],
            max_tokens: 1500,
            temperature: .5
        };

        tiled.log("Sending request with body: " + JSON.stringify(requestBody, null, 2));
        xhr.send(JSON.stringify(requestBody));

        // Since the request is synchronous, we can handle the response immediately
        tiled.log("Received response with status: " + xhr.status);
        if (xhr.responseText) {
            tiled.log("Raw response text: " + xhr.responseText);
        }

        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                tiled.log("Successfully parsed response data");
                
                if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
                    const error = "Invalid API response format - missing required fields";
                    tiled.error(error);
                    callback(new Error(error));
                    return;
                }

                try {
                    const analysisResults = JSON.parse(data.choices[0].message.content);
                    tiled.log("Successfully parsed analysis results");
                    tiled.log("Analysis results: " + JSON.stringify(analysisResults, null, 2));
                    callback(null, analysisResults);
                } catch (parseError) {
                    tiled.error("Failed to parse analysis results: " + parseError);
                    tiled.log("Raw content that failed to parse: " + data.choices[0].message.content);
                    
                    // Try to clean up the response and parse again
                    try {
                        let cleanContent = data.choices[0].message.content.trim();
                        // If it starts with a backtick (code block), remove it
                        if (cleanContent.startsWith('```')) {
                            cleanContent = cleanContent.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
                        }
                        tiled.log("Attempting to parse cleaned content: " + cleanContent);
                        const cleanResults = JSON.parse(cleanContent);
                        tiled.log("Successfully parsed cleaned results");
                        callback(null, cleanResults);
                    } catch (secondError) {
                        tiled.error("Failed to parse even after cleaning: " + secondError);
                        callback(parseError);
                    }
                }
            } catch (error) {
                tiled.error("Failed to parse API response: " + error);
                callback(error);
            }
        } else {
            const errorMessage = xhr.status === 401 ? 
                "Authentication failed. Please check your OpenAI API key in the settings." :
                "API request failed with status: " + xhr.status;
            tiled.error(errorMessage);
            callback(new Error(errorMessage));
        }
    } catch (error) {
        tiled.error("Batch preparation failed: " + error);
        callback(error);
    }
}

// Process tiles in batches
function processTileBatches(tileset, batchSize = 1) {
    const totalTiles = tileset.tileCount;
    const batches = Math.ceil(totalTiles / batchSize);
    let processedCount = 0;
    let currentBatch = 0;

    function processBatch() {
        if (currentBatch >= batches) {
            tiled.log("All batches processed. Total tiles: " + processedCount);
            tiled.alert("Analysis complete! Check tile properties to see the results.");
            return;
        }

        // Prepare batch of tiles
        const batchTiles = [];
        const tileRefs = [];

        // Collect tiles for this batch
        const startIdx = currentBatch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalTiles);
        tiled.log(`Processing batch ${currentBatch + 1}/${batches} (tiles ${startIdx + 1}-${endIdx})`);

        for (let i = startIdx; i < endIdx; i++) {
            const tile = tileset.tile(i);
            if (tile) {
                tiled.log(`Processing tile ${i + 1}`);
                const base64Image = tileToBase64(tile);
                if (base64Image) {
                    batchTiles.push(base64Image);
                    tileRefs.push(tile);
                    tiled.log(`Successfully prepared tile ${i + 1} for analysis`);
                }
            }
        }

        if (batchTiles.length > 0) {
            analyzeTileBatch(batchTiles, function(error, batchResults) {
                if (error) {
                    tiled.error(`Error processing batch ${currentBatch + 1}: ${error}`);
                    return;
                }
                
                if (batchResults && Array.isArray(batchResults)) {
                    tiled.log(`Applying analysis results to ${batchResults.length} tiles`);
                    batchResults.forEach((analysis, index) => {
                        if (analysis && tileRefs[index]) {
                            tiled.log(`Processing analysis for tile ${startIdx + index + 1}`);
                            for (const [key, value] of Object.entries(analysis)) {
                                addCustomProperty(tileRefs[index], key, value);
                            }
                            tiled.log(`Completed processing for tile ${startIdx + index + 1}`);
                        }
                    });
                }
                processedCount += batchTiles.length;
                tiled.log(`Successfully processed ${processedCount} of ${totalTiles} tiles`);
                
                // Process next batch
                currentBatch++;
                processBatch();
            });
        } else {
            currentBatch++;
            processBatch();
        }
    }

    // Start processing batches
    tiled.log(`Starting batch processing. Total tiles: ${totalTiles}, Batch size: ${batchSize}`);
    processBatch();
}

// Helper function to get the current tileset
function getCurrentTileset() {
    let tilesetEditor = tiled.activeAsset;
    if (!tilesetEditor || !tilesetEditor.isTileset) {
        tiled.alert("Please open a tileset first!");
        return null;
    }
    return tilesetEditor;
}

// Helper function to add custom property to a tile
function addCustomProperty(tile, name, value) {
    try {
        tiled.log(`Adding property ${name} to tile...`);
        
        // Check if tile is valid
        if (!tile) {
            tiled.error("Invalid tile object");
            return;
        }

        // Get the tileset this tile belongs to
        const tileset = getCurrentTileset();
        if (!tileset) return;

        // Use a macro to group all property changes into one undo command
        tileset.macro("Update Tile Properties", function() {
            // Set the property directly on the tile
            tile.setProperty(name, value);
            tiled.log(`Set property ${name}: ${value}`);
        });

        // Verify the property was set
        const verifyValue = tile.property(name);
        tiled.log(`Verified property ${name} = ${verifyValue}`);
    } catch (error) {
        tiled.error(`Failed to add property ${name}: ${error}`);
        tiled.log("Error stack trace: " + error.stack);
    }
}

// Register the analyze action
let analyzeAction = tiled.registerAction("AITagger_Analyze", function() {
    // Load settings first
    if (!loadSettings()) {
        tiled.alert("Please configure your OpenAI API key in settings.json");
        return;
    }

    let tileset = getCurrentTileset();
    if (!tileset) return;

    tiled.alert("Starting tileset analysis...");
    processTileBatches(tileset, aiTagger.settings.batchSize || 1);
});
analyzeAction.text = "Analyze Tileset";

// Register the analyze single tile action
let analyzeSingleAction = tiled.registerAction("AITagger_AnalyzeSingle", function() {
    // Load settings first
    if (!loadSettings()) {
        tiled.alert("Please configure your OpenAI API key in settings.json");
        return;
    }

    let tileset = getCurrentTileset();
    if (!tileset) return;

    // Get the selected tile
    let selectedTiles = tileset.selectedTiles;
    if (!selectedTiles || selectedTiles.length === 0) {
        tiled.alert("Please select a tile first!");
        return;
    }

    // Only analyze the first selected tile
    let tile = tileset.tile(selectedTiles[0]);
    if (!tile) {
        tiled.alert("Invalid tile selection!");
        return;
    }

    tiled.alert("Starting single tile analysis...");
    const base64Image = tileToBase64(tile);
    if (base64Image) {
        analyzeTileBatch([base64Image], function(error, batchResults) {
            if (error) {
                tiled.error("Error analyzing tile: " + error);
                tiled.alert("Failed to analyze tile. Check the error log for details.");
                return;
            }
            
            if (batchResults && Array.isArray(batchResults) && batchResults[0]) {
                for (const [key, value] of Object.entries(batchResults[0])) {
                    addCustomProperty(tile, key, value);
                }
                tiled.alert("Tile analysis complete! Check tile properties to see the results.");
            }
        });
    }
});
analyzeSingleAction.text = "Analyze Selected Tile";

// Register the find similar action
let findSimilarAction = tiled.registerAction("AITagger_FindSimilar", function() {
    let tileset = getCurrentTileset();
    if (!tileset) return;

    // Get the selected tile
    let selectedTiles = tileset.selectedTiles;
    if (!selectedTiles || selectedTiles.length === 0) {
        tiled.alert("Please select a tile first!");
        return;
    }

    let sourceTile = tileset.tile(selectedTiles[0]);
    
    // Get all properties directly from the tile
    let terrainType = sourceTile.property("terrain_type");
    let objectType = sourceTile.property("object_type");
    let connections = sourceTile.property("connections");
    let walls = sourceTile.property("walls");
    
    if (!terrainType && !objectType && !connections && !walls) {
        tiled.alert("Selected tile has no terrain_type, object_type, connections, or walls properties. Please analyze the tile first.");
        return;
    }

    // Find similar tiles based on terrain, object type, connections, and walls
    let similarTiles = [];
    for (let i = 0; i < tileset.tileCount; i++) {
        let tile = tileset.tile(i);
        if (tile && tile !== sourceTile) {
            if ((terrainType && tile.property("terrain_type") === terrainType) ||
                (objectType && tile.property("object_type") === objectType) ||
                (connections && tile.property("connections") === connections) ||
                (walls && tile.property("walls") === walls)) {
                similarTiles.push(i);
            }
        }
    }

    // Select similar tiles
    tileset.selectedTiles = similarTiles;
    tiled.alert(`Found ${similarTiles.length} similar tiles!`);
});
findSimilarAction.text = "Find Similar Tiles";

// Create settings dialog
function showSettingsDialog() {
    loadSettings();  // This will create default settings if loading fails

    const dialog = new Dialog("AI Tagger Settings");
    
    // Add API Key section
    dialog.addHeading("OpenAI Settings");
    const apiKeyInput = dialog.addTextInput("API Key:");
    apiKeyInput.text = aiTagger.settings.openaiApiKey || "";
    dialog.addNewRow();

    // Add Batch Processing section
    dialog.addHeading("Batch Processing");
    const batchSizeInput = dialog.addNumberInput("Batch Size:");
    batchSizeInput.value = aiTagger.settings.batchSize || 4;
    batchSizeInput.minimum = 1;
    batchSizeInput.maximum = 8;
    batchSizeInput.decimals = 0;  // Ensure whole numbers only
    batchSizeInput.tooltip = "Number of tiles to analyze in each batch (1-8). Larger batches are faster but cost more.";
    dialog.addNewRow();

    const confidenceInput = dialog.addNumberInput("Confidence Threshold:");
    confidenceInput.decimals = 2;
    confidenceInput.value = aiTagger.settings.confidenceThreshold || 0.7;
    confidenceInput.minimum = 0.0;
    confidenceInput.maximum = 1.0;
    confidenceInput.singleStep = 0.05;  // Allow fine-grained control
    confidenceInput.tooltip = "Minimum confidence level (0.0-1.0) for accepting AI tags. Higher values mean more accurate but potentially fewer tags.";
    dialog.addNewRow();

    // Add Save and Cancel buttons
    const saveButton = dialog.addButton("Save");
    const cancelButton = dialog.addButton("Cancel");

    // Connect save button clicked signal
    saveButton.clicked.connect(function() {
        const newSettings = {
            openaiApiKey: apiKeyInput.text.trim(),
            batchSize: batchSizeInput.value,
            confidenceThreshold: confidenceInput.value
        };

        if (saveSettings(newSettings)) {
            aiTagger.settings = newSettings;
            tiled.alert("Settings saved successfully!");
            dialog.accept();
        } else {
            tiled.alert("Failed to save settings. Check the error log for details.");
        }
    });

    // Connect cancel button clicked signal
    cancelButton.clicked.connect(function() {
        dialog.reject();
    });
    
    // Show dialog
    dialog.exec();
}

// Register the settings action
let settingsAction = tiled.registerAction("AITagger_Settings", showSettingsDialog);
settingsAction.text = "Settings";

// Add to Tileset menu
tiled.extendMenu("Tileset", [
    { separator: true },
    { action: "AITagger_Analyze" },
    { action: "AITagger_AnalyzeSingle" },
    { action: "AITagger_FindSimilar" },
    { separator: true },
    { action: "AITagger_Settings" }
]);

// Log successful initialization
tiled.log("AI Tagger plugin initialized successfully!"); 