# Physics Body and Visual Model Offset in Blob Wars

## Overview

This document explains how physics bodies and visual models are aligned in Blob Wars. Understanding this relationship is critical for properly positioning game entities (player, enemies, etc.).

## The Offset System

In Blob Wars, there is an intentional offset between the physics body and the visual model:

1. **Physics Body Position**: The physics body (Ammo.js rigid body) is positioned at `Y + 1.0` relative to the visual model's intended position
2. **Visual Model Position**: The visual model (THREE.js mesh) is rendered at `Physics.Y - 1.0`

This creates a consistent relationship where:
- Physics Body Y = Visual Model Y + 1.0
- Visual Model Y = Physics Body Y - 1.0

## Why This Offset Exists

This offset exists to align the physics capsule with the visual model appropriately:
- The physics body is a capsule shape with its center at Y+1.0
- The visual model's feet should be at ground level (Y=0)
- The offset ensures the visual model appears to stand on the ground while the physics capsule contains it properly

## Implementation Details

### Model Loading
When loading a model, the initial mesh position should be set to the intended final position:
```javascript
// Set the model's position (no offset needed here)
model.position.copy(this.position);
```

### Physics Body Creation
When creating the physics body, add the +1.0 offset to Y:
```javascript
// Position the physics body with +1.0 Y offset
transform.setOrigin(new Ammo.btVector3(
    position.x, 
    position.y + 1.0, // Add the +1.0 offset here
    position.z
));
```

### Position Updates
When updating the mesh position based on physics body position, subtract 1.0 from Y:
```javascript
// Update mesh position with -1.0 Y offset
this.mesh.position.set(
    physicsBody.x(), 
    physicsBody.y() - 1.0, // Subtract the 1.0 offset here
    physicsBody.z()
);
```

## Common Issues

If entities appear to float above the ground or sink into it, check:

1. The initial spawn position Y value (should match player height, usually 5)
2. The physics body creation (ensure +1.0 offset is added to Y)
3. The mesh position update (ensure -1.0 offset is applied to Y)

## Testing Physics Alignment

To verify proper alignment:
1. Spawn entities at the same Y position
2. Ensure they stand on the ground at the same height
3. Check that they properly collide with other objects
4. Verify they fall and land at the same height 