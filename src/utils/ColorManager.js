import { PLAYER_COLORS } from './constants.js';

export class ColorManager {
    constructor() {
        // Keep track of all assigned colors by ID
        this.assignedColors = new Map();
        // Keep track of which colors are in use
        this.usedColors = new Set();
        // Store the colors array without shuffling
        this.colors = [...PLAYER_COLORS];
    }

    // Simple hash function to convert string to number
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    // Get a unique color for a player/entity ID
    getColorForId(id) {
        // If this ID already has a color assigned, return it
        if (this.assignedColors.has(id)) {
            return this.assignedColors.get(id);
        }

        // Use the hash of the ID to get a deterministic color
        const hash = this.hashString(id);
        const colorIndex = hash % this.colors.length;
        const color = this.colors[colorIndex];

        // Store the assignment
        this.assignedColors.set(id, color);
        this.usedColors.add(color);

        return color;
    }

    // Release a color when an entity is removed
    releaseColor(id) {
        if (this.assignedColors.has(id)) {
            const color = this.assignedColors.get(id);
            this.usedColors.delete(color);
            this.assignedColors.delete(id);
        }
    }

    // Clear all color assignments (e.g., on game restart)
    reset() {
        this.assignedColors.clear();
        this.usedColors.clear();
        this.colors = [...PLAYER_COLORS];
    }

    // Get a new color when restarting a session for the same entity
    getNewColorForId(id) {
        // Release the old color if it exists
        this.releaseColor(id);
        // Then assign a new one
        return this.getColorForId(id);
    }
} 