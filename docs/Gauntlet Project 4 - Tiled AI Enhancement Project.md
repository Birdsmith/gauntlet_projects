# **Tiled AI Enhancement Project**

## **Background**

[Tiled](https://www.mapeditor.org/) is an open-source 2D map editor widely used by game developers and level designers to create tile-based maps for various game engines. Tiled offers a flexible workflow for designing levels, but currently lacks AI-assisted tools to speed up the map creation process.

This project aims to enhance **Tiled** by integrating AI-driven **tile tagging** and **natural language-based map generation**, making it easier for level designers to work efficiently. Additionally, we will introduce a **non-AI feature** that improves usability for level designers.

## **Target Users**

This project is designed for:

* **Level Designers** who create maps for 2D games and need a faster, more intuitive workflow.  
* **Indie Game Developers** looking to streamline tile placement and level design.  
* **Modders & Hobbyists** who want an accessible way to build and modify game worlds.

## **Project Overview**

This project will introduce **two major features**:

1. **AI-Powered Tile Tagging & Natural Language Map Generation**: AI will analyze tilesets, automatically tag them based on content (e.g., "water," "grass," "wall"), and use those tags to generate maps based on user prompts (e.g., "Generate a forest path leading to a castle").  
2. **Non-AI Features: Contiguous Option for Bucket Fill and Magic Wand Tools, and User-Defined Zoom Levels**: Two new features that enhance Tiled's usability for level designers.

## **Features**

### **1\. AI Feature: Tile Tagging & Natural Language Map Generation**

#### **Tile Tagging**

* AI scans a tileset and assigns relevant tags to each tile (e.g., "terrain:grass," "object:tree," "structure:wall").

#### **Natural Language Map Generation**

* Users describe a level concept in plain English (e.g., "A small village surrounded by a dense forest").  
* AI uses tagged tiles to generate a basic map layout that matches the description.  
* Provides a starting point for designers, reducing manual tile placement time.

**User Stories:**

1. "As a level designer, I want tiles to be automatically tagged so I can easily filter and select what I need."  
2. "As a game developer, I want to describe a map idea in natural language and have the AI generate a rough layout, so I can refine it faster."

**Implementation Considerations:**

* Use **image classification models** to detect tile types and assign tags.  
* Integrate an **LLM-based text parser** to translate descriptions into structured map layouts.  
* Allow users to **refine AI-generated maps** before committing to final designs.

---

### **2\. Non-AI Features: Enhancements for Level Designers**

#### **a. "Contiguous" Option for Bucket Fill and Magic Wand Tools**

**Feature Description:**

* Introduce a "Contiguous" toggle for the Bucket Fill and Magic Wand tools, allowing users to choose between affecting only connected areas or all matching tiles across the entire layer. This provides greater flexibility in tile editing and selection.

**User Stories:**

1. "As a level designer, I want to quickly fill all water tiles with a new texture, regardless of their location on the map."  
2. "As a tile artist, I want to ensure only a specific section of tiles is modified when using the magic wand, so I can maintain localized tile consistency."

**Implementation Considerations:**

* Add a checkbox labeled "Contiguous" in the tool options for both Bucket Fill and Magic Wand tools.  
* When enabled, the tools affect only connected tiles; when disabled, they affect all matching tiles on the layer.  
* Ensure the toggle state is preserved between sessions for user convenience.

#### **b. User-Defined Zoom Levels**

**Feature Description:**

* Allow users to define custom zoom levels, enabling them to set specific magnification percentages that suit their workflow. This customization enhances the user experience by providing optimal viewing preferences for different project types.

**User Stories:**

1. "As a level designer, I need to quickly switch between predefined zoom levels that match my design specifications without manually adjusting each time."  
2. "As a game developer, I want a consistent zoom experience across different projects, so I can maintain a familiar workspace."

**Implementation Considerations:**

* Provide an interface in the settings menu where users can input a list of preferred zoom percentages.  
* Modify the zoom function to include user-defined levels in addition to default presets.  
* Ensure smooth transitions between zoom levels to maintain a seamless editing experience.

## **Technical Stack Considerations**

| Component | Technology |
| ----- | ----- |
| **Image Analysis** | OpenAI Vision API (GPT-4V) |
| **Tile Tagging** | OpenAI Vision API for feature detection |
| **Natural Language Processing** | OpenAI GPT-4 / LangChain |
| **Backend** | Node.js / FastAPI |
| **Frontend (Tiled Plugin)** | C++ / Qt (for Tiled integration) |

## **User Flow**

1. **AI Tags Tiles**: The user loads a tileset, and OpenAI Vision API analyzes and assigns tags based on tile content.
2. **User Searches for Tiles by Tag**: Tags make it easy to find the right tiles.
3. **User Enters Map Description**: The user types "A castle on a hill with a river running through it."
4. **AI Generates Map Layout**: GPT-4 interprets the description and places tiles accordingly.
5. **User Edits & Refines**: The designer tweaks the layout manually.
6. **Implement Contiguous Option & User-Defined Zoom Levels**: Ensuring these usability features are working as intended.

## **Timeline & Milestones**

| Date | Milestone |
| ----- | ----- |
| Monday | Research AI models & integrate basic tile tagging |
| Tuesday | Develop basic natural language parser & map generator |
| Wednesday | Implement Contiguous Option |
| Thursday | Implement User-Defined Zoom Levels |
| Friday | Testing, UI refinements, and first release |
| Saturday/Sunday | Extra buffer days in case additional work is needed |

---

This enhancement will make **Tiled more powerful for level designers**, providing AI-assisted workflows to accelerate map creation and manual tools for enhanced usability.