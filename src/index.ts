/// <reference types="@mapeditor/tiled-api" />

// Simple test action to verify plugin loading
const testAction = tiled.registerAction("TestAITagger", function() {
    tiled.alert("AI Tagger plugin is loaded!");
});

testAction.text = "Test AI Tagger";

// Add to Tileset menu
tiled.extendMenu("Tileset", [
    { action: "TestAITagger" }
]); 