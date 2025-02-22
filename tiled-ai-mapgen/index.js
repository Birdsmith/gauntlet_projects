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
        }
    }
    
    return Array.from(mapTiles).map(t => JSON.parse(t));
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

// Create a new map with the given dimensions
function createNewGeneratedMap(width, height) {
    const newMap = new TileMap();
    newMap.setSize(width, height);
    newMap.setTileSize(32, 32); // Use standard Tiled tile size
    return newMap;
}

// Generate map based on user description using OpenAI
function generateMap(description, map, callback) {
    try {
        tiled.log("Starting map generation with description: " + description);
        
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
        const availableMapTiles = getAvailableTilesForGeneration(map);
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
            `- Each tile represents a ${map.tileWidth}x${map.tileHeight} pixel square`,
            `- The total map size is ${map.width}x${map.height} tiles`,
            "",
            mapTileSummary,
            "",
            "Tile Properties:",
            "- The 'type' property (open/closed) indicates if a tile is walkable - this is for your understanding only so if you run into a situation where you need to make walls you know to use 'closed' tiles",
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
            "1. The layout must be a complete 2D array with exactly ${map.height} rows and ${map.width} columns",
            "2. DO NOT use ellipses (...) or JavaScript code in your response",
            "3. In the layout array, only include the 'tag' for each tile, not the 'type'",
            "4. Use the EXACT tag strings as shown in the Available Tiles list above - do not modify them",
            "5. Do not add underscores, hyphens, or any other modifications to the tag names",
            "",
            "Example format:",
            `{
                "layout": [
                    ["grass", "grass", "water"],
                    ["grass", "sand", "water"],
                    ["sand", "sand", "water"]
                ]
            }`,
            "",
            "IMPORTANT: Only use tags that are listed in the Available Tiles above"
        ].join('\n');

        const mapGenPrompt = [
            "Generate a map based on this description:",
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
            model: "gpt-4-turbo",
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
            max_tokens: 4000,
            temperature: 0.7
        };

        mapGenRequest.onreadystatechange = function() {
            if (mapGenRequest.readyState === 4) {
                if (mapGenRequest.status === 200) {
                    try {
                        const mapGenResponse = JSON.parse(mapGenRequest.responseText);
                        const messageContent = mapGenResponse.choices[0].message.content;
                        tiled.log("=== AI Response ===\n" + messageContent + "\n=== End Response ===");
                        
                        const generatedMapSpec = JSON.parse(messageContent);
                        
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
                            // Use map.height directly since we want all rows including the last one
                            for (let rowIndex = 0; rowIndex < map.height; rowIndex++) {
                                const row = rowIndex < generatedMapSpec.layout.length ? generatedMapSpec.layout[rowIndex] : [];
                                for (let colIndex = 0; colIndex < map.width; colIndex++) {
                                    const tileTag = colIndex < row.length ? row[colIndex] : null;
                                    if (!tileTag) continue;
                                    
                                    // Find a matching tile from any tileset
                                    let foundTile = null;
                                    for (let tilesetIndex = 0; tilesetIndex < map.tilesets.length; tilesetIndex++) {
                                        const currentTileset = map.tilesets[tilesetIndex];
                                        for (let tileIndex = 0; tileIndex < currentTileset.tileCount; tileIndex++) {
                                            const currentTile = currentTileset.tile(tileIndex);
                                            if (currentTile && currentTile.property("tag") === tileTag) {
                                                foundTile = currentTile;
                                                break;
                                            }
                                        }
                                        if (foundTile) break;
                                    }
                                    layerEdit.setTile(colIndex, rowIndex, foundTile);
                                }
                            }
                            layerEdit.apply();
                        });

                        callback(null);
                    } catch (error) {
                        tiled.log("Error processing response: " + error);
                        callback(error);
                    }
                } else {
                    const errorMsg = `API request failed with status: ${mapGenRequest.status}`;
                    tiled.log(errorMsg);
                    if (mapGenRequest.responseText) {
                        tiled.log("Error response: " + mapGenRequest.responseText);
                    }
                    callback(new Error(errorMsg));
                }
            }
        };

        mapGenRequest.onerror = function() {
            const errorMsg = "Network error occurred while making the request";
            tiled.log(errorMsg);
            callback(new Error(errorMsg));
        };

        tiled.log("Sending request to OpenAI...");
        mapGenRequest.send(JSON.stringify(mapGenRequestBody));
    } catch (error) {
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
    if (availableMapTiles.length === 0) {
        tiled.alert("No tagged tiles found! Please make sure your tiles have 'type' and 'tag' properties.");
        return;
    }

    const mapGenDialog = new Dialog("Generate Map");
    
    mapGenDialog.addHeading("Map Description");
    const mapDescriptionInput = mapGenDialog.addTextEdit("Description:");
    mapDescriptionInput.placeholderText = "Describe how you want to modify the map. Be specific about terrain types, paths, and key features.";
    mapGenDialog.addNewRow();

    const generateMapButton = mapGenDialog.addButton("Generate");
    const cancelMapGenButton = mapGenDialog.addButton("Cancel");

    generateMapButton.clicked.connect(function() {
        tiled.log("Getting description from input field...");
        const mapDescription = mapDescriptionInput.plainText ? mapDescriptionInput.plainText.trim() : "";
        tiled.log("Raw description: '" + mapDescription + "'");
        
        if (!mapDescription) {
            tiled.log("No description provided");
            tiled.alert("Please enter a map description!");
            return;
        }

        tiled.log("Description from dialog: " + mapDescription);
        mapGenDialog.accept();
        
        tiled.alert("Generating map...");
        generateMap(mapDescription, currentMap, function(error) {
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