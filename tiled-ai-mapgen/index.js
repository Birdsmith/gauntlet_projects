// AI Map Generator plugin for Tiled
let mapGeneratorPlugin = {
    name: "AI Map Generator",
    version: "1.0.0",
    settings: null,
    defaultMapSize: 50 // Default map size in tiles
};

// Helper function to get available tiles from the current map
function getAvailableTilesForGeneration(map) {
    const mapTiles = new Set();
    const tilesByTag = new Map();
    
    // Get all tilesets used in the map
    const mapTilesets = map.tilesets;
    for (let tilesetIndex = 0; tilesetIndex < mapTilesets.length; tilesetIndex++) {
        const currentTileset = mapTilesets[tilesetIndex];
        for (let tileIndex = 0; tileIndex < currentTileset.tileCount; tileIndex++) {
            const currentTile = currentTileset.tile(tileIndex);
            if (!currentTile) continue;
            
            const tileType = currentTile.property("type");
            const tileTag = currentTile.property("tag");
            
            if (!tileType || !tileTag) continue;
            
            mapTiles.add(JSON.stringify({ type: tileType, tag: tileTag }));
            tilesByTag.set(tileTag, currentTile);
        }
    }
    
    return {
        tiles: Array.from(mapTiles).map(t => JSON.parse(t)),
        tilesByTag: tilesByTag
    };
}

// Create a formatted tile summary for the AI
function createMapTileSummary(mapTiles) {
    const summaryLines = [
        "Available Tiles:",
        "---------------",
        ""
    ];

    mapTiles.forEach(tile => {
        summaryLines.push(`${tile.tag} (${tile.type})`);
    });

    return summaryLines.join('\n');
}

// Generate map based on user description using OpenAI
function generateMap(description, map, bounds, callback, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    try {
        tiled.log(`Starting map generation attempt ${attempt} with description: ${description}`);
        tiled.log("Generation bounds: " + JSON.stringify(bounds));
        
        // Calculate dimensions
        const width = bounds.bottomRight.x - bounds.topLeft.x + 1;
        const height = bounds.bottomRight.y - bounds.topLeft.y + 1;
        tiled.log(`Generating area: ${width}x${height} tiles`);
        
        // Load settings first and ensure they exist
        tiled.log("Loading settings...");
        const mapSettingsLoaded = loadMapGeneratorSettings();
        tiled.log("Settings load result: " + mapSettingsLoaded);
        
        if (!mapSettingsLoaded || !mapGeneratorPlugin.settings) {
            tiled.log("Settings not loaded properly, showing settings dialog");
            showMapGeneratorSettings();
            callback(new Error("Please configure settings first and try again"));
            return;
        }

        // Log settings state for debugging
        tiled.log("Settings loaded successfully");

        // Validate API key
        if (!mapGeneratorPlugin.settings.openaiApiKey || mapGeneratorPlugin.settings.openaiApiKey.trim() === "") {
            tiled.log("API key missing or empty");
            showMapGeneratorSettings();
            callback(new Error("Please enter your OpenAI API key in settings and try again"));
            return;
        }

        const generatorApiKey = mapGeneratorPlugin.settings.openaiApiKey.trim();
        tiled.log("API key validated");

        // Get available tiles and create summary
        const { tiles: availableMapTiles, tilesByTag } = getAvailableTilesForGeneration(map);
        const mapTileSummary = createMapTileSummary(availableMapTiles);
        
        tiled.log("Available Tiles:");
        tiled.log(mapTileSummary);

        const mapGenRequest = new XMLHttpRequest();
        mapGenRequest.open('POST', 'https://api.openai.com/v1/chat/completions', true);
        mapGenRequest.setRequestHeader('Content-Type', 'application/json');
        mapGenRequest.setRequestHeader('Authorization', 'Bearer ' + generatorApiKey);

        const mapGenSystemPrompt = [
            "You are an AI specialized in generating procedural tile-based maps.",
            "You must generate a structured layout that represents a grid-based terrain map, following these rules:",
            "",
            "Grid Structure:",
            `- You will generate a ${width}x${height} area starting at coordinates (${bounds.topLeft.x}, ${bounds.topLeft.y})`,
            `- You MUST generate EXACTLY ${height} rows and ${width} columns - no more, no less`,
            "- Every position in the grid MUST have a valid tile tag - do not leave any positions empty",
            "- CRITICAL: The layout array MUST contain the EXACT number of rows and columns specified - partial layouts will be rejected",
            "",
            mapTileSummary,
            "",
            "Tile Properties:",
            "- The 'type' property (open/closed) indicates if a tile is walkable - this is for your understanding only",
            "- The 'tag' property describes the tile's appearance (e.g., 'grass', 'water') - this is what you should use in your response",
            "",
            "Feature Rules:",
            "- All features must be contiguous. No isolated tiles unless explicitly required",
            "- Forest coastlines must appear wavy, rather than straight edges",
            "- Roads should be smoothly curved when requested and intersections should align properly",
            "- Respect spatial relationships (e.g., roads cannot cut through water unless bridges are specified)",
            "- Only use tags that are listed in the Available Tiles above",
            "",
            "RESPONSE FORMAT REQUIREMENTS:",
            "CRITICAL: Your response must ONLY contain the JSON object - no explanations or other text",
            `1. The layout array MUST contain EXACTLY ${height} rows and ${width} columns - partial layouts will be rejected`,
            "2. DO NOT use ellipses (...) or JavaScript code in your response",
            "3. Every position in the layout MUST have a valid tile tag from the Available Tiles list above",
            "4. Use the EXACT tag strings as shown in the Available Tiles list - do not modify them",
            "5. Do not add underscores, hyphens, or any other modifications to the tag names",
            "6. Do not skip any rows or columns - the entire area must be filled",
            "",
            "Example format (assuming 3x3 area):",
            `{
                "layout": [
                    ["grass", "grass", "water"],  // Row 1: exactly 3 columns
                    ["grass", "sand", "water"],   // Row 2: exactly 3 columns
                    ["sand", "sand", "water"]     // Row 3: exactly 3 columns
                ]
            }`,
            "",
            "VALIDATION CHECKLIST:",
            `✓ Response contains ONLY the JSON object - no other text`,
            `✓ Layout array has exactly ${height} rows`,
            `✓ Each row has exactly ${width} columns`,
            "✓ Every position has a valid tile tag",
            "✓ All tile tags match exactly with Available Tiles list",
            "",
            "IMPORTANT: Only use tags that are listed in the Available Tiles above",
            "CRITICAL: Your response will be rejected if it does not contain exactly the requested number of rows and columns",
            "CRITICAL: Do not include any explanatory text - respond with ONLY the JSON object"
        ].join('\n');

        const mapGenPrompt = [
            `Generate a ${width}x${height} area of the map starting at coordinates (${bounds.topLeft.x}, ${bounds.topLeft.y}) based on this description:`,
            description,
            "",
            "Response format:",
            `{
                "layout": [
                    ["grass", "grass", "water"],
                    ["grass", "sand", "water"]
                ]
            }`
        ].join('\n');

        const mapGenRequestBody = {
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: mapGenSystemPrompt
                },
                {
                    role: "user",
                    content: mapGenPrompt
                }
            ],
            max_tokens: 3000,
            temperature: 0.7
        };

        mapGenRequest.onreadystatechange = function() {
            if (mapGenRequest.readyState === 4) {
                if (mapGenRequest.status === 200) {
                    try {
                        const mapGenResponse = JSON.parse(mapGenRequest.responseText);
                        tiled.log("=== Raw API Response ===\n" + JSON.stringify(mapGenResponse, null, 2) + "\n=== End Raw Response ===");
                        
                        const messageContent = mapGenResponse.choices[0].message.content;
                        tiled.log("=== AI Message Content ===\n" + messageContent + "\n=== End Message Content ===");
                        
                        try {
                            // Clean up the message content by removing markdown code blocks and trimming whitespace
                            let cleanContent = messageContent.replace(/```(?:json)?\n?([\s\S]*?)\n?```/g, '$1').trim();
                            
                            // Extract just the JSON part by finding content between { and }
                            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
                            if (!jsonMatch) {
                                throw new Error("No JSON object found in response");
                            }
                            
                            tiled.log("=== Extracted JSON ===\n" + jsonMatch[0] + "\n=== End Extracted JSON ===");
                            const generatedMapSpec = JSON.parse(jsonMatch[0]);
                            
                            // Validate layout dimensions
                            if (!generatedMapSpec.layout || 
                                generatedMapSpec.layout.length !== height || 
                                generatedMapSpec.layout[0].length !== width) {
                                tiled.log(`Warning: Generated layout dimensions (${generatedMapSpec.layout?.length}x${generatedMapSpec.layout?.[0]?.length}) ` +
                                         `do not match requested dimensions (${height}x${width})`);
                                
                                if (attempt < MAX_ATTEMPTS) {
                                    tiled.log(`Retrying generation (attempt ${attempt + 1} of ${MAX_ATTEMPTS})...`);
                                    generateMap(description, map, bounds, callback, attempt + 1);
                                    return;
                                } else {
                                    tiled.log("Max attempts reached, showing error to user");
                                    callback(new Error(`Failed to generate correct map dimensions after ${MAX_ATTEMPTS} attempts. ` +
                                                     `Expected ${height}x${width}, got ${generatedMapSpec.layout?.length}x${generatedMapSpec.layout?.[0]?.length}`));
                                    return;
                                }
                            }
                            
                            // Get the current layer or create one if none exists
                            let mapLayer = map.currentLayer;
                            if (!mapLayer) {
                                mapLayer = new TileLayer();
                                mapLayer.name = "Ground";
                                map.addLayer(mapLayer);
                            }

                            // Place tiles according to the layout
                            map.macro("Update Map Layout", function() {
                                const layerEdit = mapLayer.edit();
                                const layout = generatedMapSpec.layout;
                                
                                // Log dimensions for debugging
                                tiled.log(`Placing tiles for area: ${width}x${height}`);
                                tiled.log(`Layout dimensions: ${layout.length} rows x ${layout[0].length} columns`);
                                
                                for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
                                    const row = layout[rowIndex];
                                    for (let colIndex = 0; colIndex < row.length; colIndex++) {
                                        const currentTag = row[colIndex];
                                        if (currentTag) {
                                            const tile = tilesByTag.get(currentTag);
                                            if (tile) {
                                                const mapX = bounds.topLeft.x + colIndex;
                                                const mapY = bounds.topLeft.y + rowIndex;
                                                layerEdit.setTile(mapX, mapY, tile);
                                                
                                                // Log tile placement for debugging
                                                if (rowIndex === layout.length - 1) {
                                                    tiled.log(`Placing bottom row tile at (${mapX}, ${mapY}): ${currentTag}`);
                                                }
                                            } else {
                                                tiled.log(`Warning: No tile found for tag "${currentTag}"`);
                                            }
                                        }
                                    }
                                }
                                layerEdit.apply();
                            });

                            callback(null);
                        } catch (parseError) {
                            tiled.log("Error parsing AI message content into map spec:");
                            tiled.log("Parse error: " + parseError.message);
                            tiled.log("Content that failed to parse: " + messageContent);
                            callback(new Error("Failed to parse AI message content: " + parseError.message));
                        }
                    } catch (error) {
                        tiled.log("Error parsing API response:");
                        tiled.log("Parse error: " + error.message);
                        tiled.log("Raw response text: " + mapGenRequest.responseText);
                        callback(new Error("Failed to parse API response: " + error.message));
                    }
                } else {
                    tiled.log("API request failed with status: " + mapGenRequest.status);
                    if (mapGenRequest.responseText) {
                        tiled.log("Error response body: " + mapGenRequest.responseText);
                    }
                    callback(new Error("API request failed with status: " + mapGenRequest.status));
                }
            }
        };

        mapGenRequest.onerror = function() {
            tiled.log("API request failed");
            callback(new Error("API request failed"));
        };

        tiled.log("Sending request to OpenAI API...");
        mapGenRequest.send(JSON.stringify(mapGenRequestBody));

    } catch (error) {
        tiled.log("Error in generateMap: " + error.message);
        callback(error);
    }
}

// Load settings from file
function loadMapGeneratorSettings() {
    try {
        const mapGenSettingsPath = tiled.extensionsPath + "/tiled-ai-mapgen/settings.json";
        tiled.log("Attempting to load settings from: " + mapGenSettingsPath);
        
        // If file doesn't exist, create with defaults
        if (!File.exists(mapGenSettingsPath)) {
            tiled.log("Settings file does not exist, creating with defaults");
            const mapGenDefaults = {
                openaiApiKey: "",
                defaultMapWidth: 20,
                defaultMapHeight: 15
            };
            const mapGenDirPath = tiled.extensionsPath + "/tiled-ai-mapgen";
            if (!File.exists(mapGenDirPath)) {
                tiled.log("Creating extension directory: " + mapGenDirPath);
                File.mkdir(mapGenDirPath);
            }
            const mapGenSettingsFile = new TextFile(mapGenSettingsPath, TextFile.WriteOnly);
            mapGenSettingsFile.write(JSON.stringify(mapGenDefaults, null, 2));
            mapGenSettingsFile.close();
            mapGeneratorPlugin.settings = mapGenDefaults;
            tiled.log("Created default settings: " + JSON.stringify(mapGenDefaults, null, 2));
            return false;
        }

        // Read existing settings
        tiled.log("Reading existing settings file");
        const mapGenSettingsFile = new TextFile(mapGenSettingsPath, TextFile.ReadOnly);
        const mapGenSettingsContent = mapGenSettingsFile.readAll();
        mapGenSettingsFile.close();

        if (!mapGenSettingsContent || mapGenSettingsContent.trim() === "") {
            tiled.log("Settings file is empty");
            throw new Error("Settings file is empty");
        }

        let mapGenSettings;
        try {
            mapGenSettings = JSON.parse(mapGenSettingsContent);
        } catch (error) {
            tiled.log("Failed to parse settings file");
            throw error;
        }
        if (!mapGenSettings || typeof mapGenSettings !== 'object') {
            tiled.log("Invalid settings format");
            throw new Error("Invalid settings format");
        }

        mapGeneratorPlugin.settings = mapGenSettings;
        tiled.log("Successfully loaded settings");
        return true;
    } catch (error) {
        tiled.error("Failed to load settings: " + error);
        return false;
    }
}

// Save settings to file
function saveMapGeneratorSettings(settings) {
    let mapGenSettingsFile = null;
    try {
        const mapGenSettingsPath = tiled.extensionsPath + "/tiled-ai-mapgen/settings.json";
        tiled.log("Attempting to save settings to: " + mapGenSettingsPath);
        
        // Validate settings
        if (!settings || typeof settings !== 'object') {
            tiled.log("Invalid settings object");
            throw new Error("Invalid settings object");
        }

        if (!settings.openaiApiKey) {
            tiled.log("No API key provided in settings");
            throw new Error("No API key provided");
        }

        tiled.log("Preparing to save settings...");
        
        // Create directory if it doesn't exist
        const mapGenDirPath = tiled.extensionsPath + "/tiled-ai-mapgen";
        if (!File.exists(mapGenDirPath)) {
            tiled.log("Creating extension directory: " + mapGenDirPath);
            File.mkdir(mapGenDirPath);
        }
        
        // Write settings
        mapGenSettingsFile = new TextFile(mapGenSettingsPath, TextFile.WriteOnly);
        mapGenSettingsFile.write(JSON.stringify(settings, null, 2));
        
        // Update global settings
        mapGeneratorPlugin.settings = settings;
        tiled.log("Settings saved successfully");
        return true;
    } catch (error) {
        tiled.error("Failed to save settings: " + error);
        return false;
    } finally {
        if (mapGenSettingsFile) {
            mapGenSettingsFile.close();
        }
    }
}

// Create settings dialog
function showMapGeneratorSettings() {
    tiled.log("Opening settings dialog");
    
    // Load existing settings first
    const mapGenSettingsLoaded = loadMapGeneratorSettings();
    tiled.log("Settings loaded: " + mapGenSettingsLoaded);
    
    // Initialize with defaults only if loading failed
    if (!mapGeneratorPlugin.settings) {
        tiled.log("No settings found, using defaults");
        mapGeneratorPlugin.settings = {
            openaiApiKey: "",
            defaultMapWidth: 20,
            defaultMapHeight: 15
        };
    }

    const mapGenDialog = new Dialog("AI Map Generator Settings");
    
    mapGenDialog.addHeading("OpenAI Settings");
    const mapGenApiKeyInput = mapGenDialog.addTextInput("API Key:");
    mapGenApiKeyInput.text = mapGeneratorPlugin.settings.openaiApiKey || "";
    mapGenApiKeyInput.placeholderText = "Enter your OpenAI API key here";
    mapGenDialog.addNewRow();

    mapGenDialog.addHeading("Default Map Size");
    const mapWidthInput = mapGenDialog.addNumberInput("Width:");
    mapWidthInput.value = mapGeneratorPlugin.settings.defaultMapWidth || 20;
    mapWidthInput.minimum = 5;
    mapWidthInput.maximum = 100;
    mapGenDialog.addNewRow();

    const mapHeightInput = mapGenDialog.addNumberInput("Height:");
    mapHeightInput.value = mapGeneratorPlugin.settings.defaultMapHeight || 15;
    mapHeightInput.minimum = 5;
    mapHeightInput.maximum = 100;
    mapGenDialog.addNewRow();

    const mapGenSaveButton = mapGenDialog.addButton("Save");
    const mapGenCancelButton = mapGenDialog.addButton("Cancel");

    mapGenSaveButton.clicked.connect(function() {
        tiled.log("Save button clicked");
        const mapGenApiKey = mapGenApiKeyInput.text.trim();
        
        if (!mapGenApiKey) {
            tiled.log("No API key provided");
            tiled.alert("Please enter your OpenAI API key!");
            return;
        }
        
        tiled.log("Preparing to save settings - API key length: " + mapGenApiKey.length);
        
        const newMapGenSettings = {
            openaiApiKey: mapGenApiKey,
            defaultMapWidth: mapWidthInput.value,
            defaultMapHeight: mapHeightInput.value
        };

        // Try to save immediately
        const mapGenSettingsSaved = saveMapGeneratorSettings(newMapGenSettings);
        tiled.log("Save operation result: " + mapGenSettingsSaved);
        
        if (mapGenSettingsSaved) {
            tiled.log("Settings saved successfully");
            mapGenDialog.accept();
            tiled.alert("Settings saved successfully!");
        } else {
            tiled.log("Failed to save settings");
            tiled.alert("Failed to save settings. Check the error log for details.");
        }
    });

    mapGenCancelButton.clicked.connect(function() {
        tiled.log("Settings dialog cancelled");
        mapGenDialog.reject();
    });
    
    mapGenDialog.exec();
}

// Show map generation dialog
function showGenerateMapDialog() {
    // Load settings first
    if (!loadMapGeneratorSettings()) {
        tiled.log("Failed to load settings, prompting user to configure");
        tiled.alert("Please configure your OpenAI API key in settings first.");
        showMapGeneratorSettings();
        return;
    }

    tiled.log("Settings loaded in showGenerateMapDialog: " + JSON.stringify(mapGeneratorPlugin.settings, null, 2));
    tiled.log("Settings loaded successfully");

    // Check for open map
    const currentMap = tiled.activeAsset;
    if (!currentMap || !currentMap.isTileMap) {
        tiled.alert("Please open a map first!");
        return;
    }

    // Check if map has any tilesets
    if (currentMap.tilesets.length === 0) {
        tiled.alert("The current map has no tilesets! Please add a tileset first.");
        return;
    }

    // Check if tilesets have any tagged tiles
    const availableMapTiles = getAvailableTilesForGeneration(currentMap);
    if (availableMapTiles.tiles.length === 0) {
        tiled.alert("No tagged tiles found! Please make sure your tiles have 'type' and 'tag' properties.");
        return;
    }

    const mapGenDialog = new Dialog("Generate Map");
    
    mapGenDialog.addHeading("Map Description");
    const mapDescriptionInput = mapGenDialog.addTextEdit("Description:");
    mapDescriptionInput.placeholderText = "Describe how you want to modify the map. Be specific about terrain types, paths, and key features.";
    mapGenDialog.addNewRow();

    // Add coordinate selection
    mapGenDialog.addHeading("Generation Bounds");
    
    // Get selected area and calculate bounds
    let initialBounds;
    if (currentMap.selectedArea && currentMap.selectedArea.boundingRect) {
        const selection = currentMap.selectedArea.boundingRect;
        tiled.log("Found selection: " + JSON.stringify(selection));
        
        initialBounds = {
            topLeft: { x: selection.x, y: selection.y },
            bottomRight: { x: selection.x + selection.width - 1, y: selection.y + selection.height - 1 }
        };
        
        // If bottomRight is (-1,-1) and thus out of bounds, use full map bounds instead
        if (initialBounds.bottomRight.x === -1 && initialBounds.bottomRight.y === -1) {
            initialBounds = {
                topLeft: { x: 0, y: 0 },
                bottomRight: { x: currentMap.width - 1, y: currentMap.height - 1 }
            };
        }
    } else {
        // No selection at all, use full map bounds
        initialBounds = {
            topLeft: { x: 0, y: 0 },
            bottomRight: { x: currentMap.width - 1, y: currentMap.height - 1 }
        };
    }
    
    // Top Left coordinates
    const topLeftXInput = mapGenDialog.addNumberInput("Top Left X:");
    topLeftXInput.value = initialBounds.topLeft.x;
    topLeftXInput.minimum = 0;
    topLeftXInput.maximum = currentMap.width - 1;
    mapGenDialog.addNewRow();
    
    const topLeftYInput = mapGenDialog.addNumberInput("Top Left Y:");
    topLeftYInput.value = initialBounds.topLeft.y;
    topLeftYInput.minimum = 0;
    topLeftYInput.maximum = currentMap.height - 1;
    mapGenDialog.addNewRow();

    // Bottom Right coordinates
    const bottomRightXInput = mapGenDialog.addNumberInput("Bottom Right X:");
    bottomRightXInput.value = initialBounds.bottomRight.x;
    bottomRightXInput.minimum = 0;
    bottomRightXInput.maximum = currentMap.width - 1;
    mapGenDialog.addNewRow();
    
    const bottomRightYInput = mapGenDialog.addNumberInput("Bottom Right Y:");
    bottomRightYInput.value = initialBounds.bottomRight.y;
    bottomRightYInput.minimum = 0;
    bottomRightYInput.maximum = currentMap.height - 1;
    mapGenDialog.addNewRow();

    const generateMapButton = mapGenDialog.addButton("Generate");
    const cancelMapGenButton = mapGenDialog.addButton("Cancel");

    generateMapButton.clicked.connect(function() {
        tiled.log("Getting description and coordinates from input fields...");
        const mapDescription = mapDescriptionInput.plainText ? mapDescriptionInput.plainText.trim() : "";
        
        // Get coordinates
        const bounds = {
            topLeft: { x: topLeftXInput.value, y: topLeftYInput.value },
            bottomRight: { x: bottomRightXInput.value, y: bottomRightYInput.value }
        };
        
        // Validate coordinates
        if (bounds.topLeft.x > bounds.bottomRight.x || bounds.topLeft.y > bounds.bottomRight.y) {
            tiled.alert("Invalid coordinates! Top left must be above and to the left of bottom right.");
            return;
        }
        
        if (!mapDescription) {
            tiled.log("No description provided");
            tiled.alert("Please enter a map description!");
            return;
        }

        tiled.log("Description from dialog: " + mapDescription);
        tiled.log("Generation bounds: " + JSON.stringify(bounds));
        mapGenDialog.accept();
        
        tiled.alert("Generating map...");
        generateMap(mapDescription, currentMap, bounds, function(error) {
            if (error) {
                tiled.alert("Failed to generate map: " + error.message);
                return;
            }
            
            tiled.alert("Map updated successfully!");
        });
    });

    cancelMapGenButton.clicked.connect(function() {
        mapGenDialog.reject();
    });
    
    mapGenDialog.exec();
}

// Register actions
let mapGeneratorSettingsAction = tiled.registerAction("AIMapGen_Settings", showMapGeneratorSettings);
mapGeneratorSettingsAction.text = "Settings";

let generateMapAction = tiled.registerAction("AIMapGen_Generate", showGenerateMapDialog);
generateMapAction.text = "Generate Map";

// Add to Map menu
tiled.extendMenu("Map", [
    { separator: true },
    { action: "AIMapGen_Generate" },
    { action: "AIMapGen_Settings" }
]);

// Log successful initialization
tiled.log("AI Map Generator plugin initialized successfully!");

// Log the extensions path when the plugin initializes
tiled.log("Tiled extensions path: " + tiled.extensionsPath); 