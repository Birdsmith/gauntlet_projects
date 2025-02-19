/// <reference types="@mapeditor/tiled-api" />

// Configuration
const CONFIG_KEY = 'config.json';
const DEFAULT_CONFIG = {
    openaiApiKey: '',
    model: 'gpt-4-vision-preview'
};

// Load or create config
let config = Object.assign({}, DEFAULT_CONFIG);
const configPath = tiled.extensionsPath + "/tiled-ai-tagger/" + CONFIG_KEY;

// Function to save configuration
function saveConfig() {
    try {
        const file = new TextFile(configPath, TextFile.WriteOnly);
        file.write(JSON.stringify(config, null, 2));
        file.close();
        tiled.log("Configuration saved successfully");
    } catch (error) {
        tiled.log("Error saving configuration: " + error.message);
    }
}

// Try to load existing config, create if doesn't exist
try {
    const file = new TextFile(configPath, TextFile.ReadWrite);
    if (file.size > 0) {
        const savedConfig = JSON.parse(file.readAll());
        config = savedConfig;
        tiled.log("Loaded saved configuration");
    } else {
        tiled.log("Creating new configuration file with defaults");
        saveConfig();
    }
    file.close();
} catch (error) {
    tiled.log("Using default configuration: " + error.message);
    saveConfig();
}

// Convert image to base64
function imageToBase64(img) {
    // Save image to a temporary file
    const tempFile = new TextFile(tiled.extensionsPath + "/tiled-ai-tagger/temp.png", TextFile.ReadWrite);
    img.save(tempFile.fileName, "PNG");
    tempFile.close();

    // Read the file as binary data
    const imageData = new TextFile(tempFile.fileName, TextFile.ReadOnly);
    const base64 = imageData.readAll();
    imageData.close();

    return base64;
}

// Analyze a tile using OpenAI Vision API
async function analyzeTileWithOpenAI(tile) {
    if (!config.openaiApiKey) {
        throw new Error("OpenAI API key not configured");
    }

    const img = tile.image();
    if (!img) {
        throw new Error("Failed to get tile image");
    }

    const base64Image = imageToBase64(img);
    
    // Create the request body
    const requestBody = {
        model: config.model,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyze this tile image and provide tags in the following categories: terrain_type, object_type, style, color_palette. Return the response as a JSON object with these categories as keys and confidence scores (0-1) for each tag."
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            }
        ],
        max_tokens: 300
    };

    // Make the API request using XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.openai.com/v1/chat/completions", false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${config.openaiApiKey}`);
    xhr.send(JSON.stringify(requestBody));

    if (xhr.status !== 200) {
        throw new Error(`Failed to connect to OpenAI API: ${xhr.statusText}`);
    }

    const result = JSON.parse(xhr.responseText);
    return result.choices[0].message.content;
}

// API functions
async function analyzeTileset() {
    if (!tiled.activeAsset || !('tiles' in tiled.activeAsset)) {
        tiled.alert("Please open a tileset first!");
        return;
    }

    if (!config.openaiApiKey) {
        tiled.alert("Please configure your OpenAI API key in settings first!");
        return;
    }

    const tileset = tiled.activeAsset;
    const totalTiles = tileset.tiles.length;

    tiled.alert(`Analyzing ${totalTiles} tiles... This may take a moment.`);
    
    try {
        for (const tile of tileset.tiles) {
            const result = await analyzeTileWithOpenAI(tile);
            tile.setProperty("ai_tags", result);
            tiled.log(`Analyzed tile ${tile.id}`);
        }
        
        tiled.alert(`Analysis complete! Processed ${totalTiles} tiles.`);
    } catch (error) {
        tiled.alert('An error occurred: ' + error.message);
        tiled.log("Error analyzing tileset: " + error);
    }
}

// Settings dialog
function showSettings() {
    const dialog = new Dialog("AI Tagger Settings");
    dialog.addHeading("OpenAI Settings");
    dialog.addNewRow();
    
    const apiKeyInput = dialog.addTextInput("API Key:");
    apiKeyInput.text = config.openaiApiKey || "";
    
    const modelInput = dialog.addComboBox("Model:", ["gpt-4-vision-preview"]);
    modelInput.currentText = config.model;
    
    if (dialog.exec()) {
        config.openaiApiKey = apiKeyInput.text;
        config.model = modelInput.currentText;
        saveConfig();
        tiled.alert("Settings updated successfully!");
    }
}

function resetSettings() {
    config = Object.assign({}, DEFAULT_CONFIG);
    saveConfig();
    tiled.alert("Settings reset to default values!");
}

// Register actions
const actions = {
    analyzeTileset: tiled.registerAction("AnalyzeTileset", analyzeTileset),
    showSettings: tiled.registerAction("ShowSettings", showSettings),
    resetSettings: tiled.registerAction("ResetSettings", resetSettings)
};

// Set action text
actions.analyzeTileset.text = "Analyze Current Tileset";
actions.showSettings.text = "Settings";
actions.resetSettings.text = "Reset Settings";

// Create menu items under Edit menu
tiled.extendMenu("Edit", [
    { separator: true },
    { action: "AnalyzeTileset" },
    { action: "ShowSettings" },
    { action: "ResetSettings" }
]);

// Ensure cleanup runs when script is reset
if (typeof tiled !== 'undefined') {
    tiled.log("AI Tagger plugin initialized");
} 