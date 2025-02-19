/// <reference types="@mapeditor/tiled-api" />

import * as tf from '@tensorflow/tfjs';

export class ModelManager {
    private model: tf.LayersModel | null = null;
    private readonly MODEL_PATH = 'file://models/tile_tagger_model';
    private readonly IMAGE_SIZE = 64;

    constructor() {
        this.initializeModel();
    }

    private async initializeModel(): Promise<void> {
        try {
            this.model = await tf.loadLayersModel(this.MODEL_PATH);
            console.log('Model loaded successfully');
        } catch (error) {
            console.error('Error loading model:', error);
            this.model = await this.createModel();
            await this.model.save(this.MODEL_PATH);
        }
    }

    private async createModel(): Promise<tf.LayersModel> {
        const model = tf.sequential();

        // Base layers (simplified ResNet-like architecture)
        model.add(tf.layers.conv2d({
            inputShape: [this.IMAGE_SIZE, this.IMAGE_SIZE, 3],
            filters: 32,
            kernelSize: 3,
            activation: 'relu'
        }));
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        
        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu'
        }));
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        
        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.5 }));
        
        // Output layer for multi-label classification
        // Adjust units based on your tag categories
        model.add(tf.layers.dense({ 
            units: 9,  // 3 categories x 3 subcategories
            activation: 'sigmoid' 
        }));

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    public analyzeTileImage(image: any): number[] {
        if (!this.model) {
            throw new Error('Model not initialized');
        }

        // Convert image to tensor
        const tensor = this.preprocessImage(image);
        
        // Get predictions
        const predictions = tf.tidy(() => {
            const output = this.model!.predict(tensor) as tf.Tensor;
            return Array.from(output.dataSync());
        });

        // Cleanup
        tensor.dispose();

        return predictions;
    }

    private preprocessImage(image: any): tf.Tensor4D {
        // Convert image to tensor and preprocess
        return tf.tidy(() => {
            // Convert image to tensor
            let tensor = tf.browser.fromPixels(image);
            
            // Resize
            tensor = tf.image.resizeBilinear(tensor, [this.IMAGE_SIZE, this.IMAGE_SIZE]);
            
            // Normalize
            tensor = tensor.toFloat().div(255);
            
            // Expand dimensions to match model input shape [batch, height, width, channels]
            return tensor.expandDims(0);
        });
    }

    public async updateModel(newWeights: tf.Tensor[]): Promise<void> {
        if (!this.model) {
            throw new Error('Model not initialized');
        }

        // Set new weights
        this.model.setWeights(newWeights);
        
        // Save updated model
        await this.model.save(this.MODEL_PATH);
    }
} 