import { PLAYER_COLORS } from './constants.js';
import { log } from '../debug.js';

export class ColorManager {
    constructor() {
        // Keep track of all assigned colors by ID
        this.assignedColors = new Map();
        // Keep track of which colors are in use
        this.usedColors = new Set();
        // Generate a random shuffle of colors at startup
        this.shuffledColors = [...PLAYER_COLORS];
        this.shuffleColors();
    }

    // Shuffle the colors array to get a random ordering
    shuffleColors() {
        for (let i = this.shuffledColors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffledColors[i], this.shuffledColors[j]] = [this.shuffledColors[j], this.shuffledColors[i]];
        }
        log('Colors shuffled for this session');
    }

    // Get a unique color for a player/entity ID
    getColorForId(id) {
        // If this ID already has a color assigned, return it
        if (this.assignedColors.has(id)) {
            return this.assignedColors.get(id);
        }

        // Find an unused color from the shuffled list
        for (let color of this.shuffledColors) {
            if (!this.usedColors.has(color)) {
                this.usedColors.add(color);
                this.assignedColors.set(id, color);
                log(`Assigned color ${color.toString(16)} to entity ${id}`);
                return color;
            }
        }

        // If all colors are used, pick a random one
        const randomColor = this.shuffledColors[Math.floor(Math.random() * this.shuffledColors.length)];
        this.assignedColors.set(id, randomColor);
        log(`All colors in use, assigned random color ${randomColor.toString(16)} to entity ${id}`);
        return randomColor;
    }

    // Release a color when an entity is removed
    releaseColor(id) {
        if (this.assignedColors.has(id)) {
            const color = this.assignedColors.get(id);
            this.usedColors.delete(color);
            this.assignedColors.delete(id);
            log(`Released color ${color.toString(16)} from entity ${id}`);
        }
    }

    // Clear all color assignments (e.g., on game restart)
    reset() {
        this.assignedColors.clear();
        this.usedColors.clear();
        this.shuffleColors();
        log('Color manager reset, all colors released');
    }

    // Get a random new color when restarting a session for the same entity
    getNewColorForId(id) {
        // Release the old color if it exists
        this.releaseColor(id);
        // Then assign a new one
        return this.getColorForId(id);
    }
} 