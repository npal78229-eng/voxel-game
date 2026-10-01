import { BLOCK_BY_ID, BLOCK_DEFINITIONS } from './blocks.js';

// ============================================================================
// Phase 4 (Part 4A) — Stack-Based Inventory (27 Backpack + 9 Hotbar) & Crafting
// ============================================================================

export const HOTBAR_SIZE = 9;
export const BACKPACK_SIZE = 27;
export const TOTAL_SLOTS = HOTBAR_SIZE + BACKPACK_SIZE; // 36 total slots (0..8 hotbar, 9..35 backpack)
export const MAX_STACK_SIZE = 64;

/**
 * Task 4A.C — Data-Driven Crafting Recipe Table (no hardcoded per-recipe if-chains).
 * Each recipe defines required input item counts and the resulting output stack.
 */
export const CRAFTING_RECIPES = [
  {
    id: 'oak_planks_from_log',
    name: 'Oak Planks (x4)',
    description: '1 Oak Log -> 4 Oak Planks',
    inputs: { wood: 1 },
    output: { itemType: 'planks', count: 4 },
  },
  {
    id: 'birch_planks_from_log',
    name: 'Birch Planks (x4)',
    description: '1 Birch Log -> 4 Birch Planks',
    inputs: { birch_wood: 1 },
    output: { itemType: 'birch_planks', count: 4 },
  },
  {
    id: 'pine_planks_from_log',
    name: 'Spruce Planks (x4)',
    description: '1 Spruce Log -> 4 Spruce Planks',
    inputs: { pine_log: 1 },
    output: { itemType: 'pine_planks', count: 4 },
  },
  {
    id: 'darkoak_planks_from_log',
    name: 'Dark Oak Planks (x4)',
    description: '1 Dark Oak Log -> 4 Dark Oak Planks',
    inputs: { log_darkoak: 1 },
    output: { itemType: 'planks_darkoak', count: 4 },
  },
  {
    id: 'maple_planks_from_log',
    name: 'Maple Planks (x4)',
    description: '1 Maple Log -> 4 Maple Planks',
    inputs: { log_maple: 1 },
    output: { itemType: 'planks_maple', count: 4 },
  },
  {
    id: 'redwood_planks_from_log',
    name: 'Redwood Planks (x4)',
    description: '1 Redwood Log -> 4 Redwood Planks',
    inputs: { log_redwood: 1 },
    output: { itemType: 'planks_redwood', count: 4 },
  },
  {
    id: 'crafting_table_from_planks',
    name: 'Crafting Table (x1)',
    description: '4 Oak Planks -> 1 Crafting Table',
    inputs: { planks: 4 },
    output: { itemType: 'crafting_table', count: 1 },
  },
  {
    id: 'furnace_from_cobble',
    name: 'Smelting Furnace (x1)',
    description: '4 Cobblestone -> 1 Smelting Furnace',
    inputs: { cobblestone: 4 },
    output: { itemType: 'furnace', count: 1 },
  },
  {
    id: 'stone_bricks_from_stone',
    name: 'Stone Bricks (x4)',
    description: '4 Stone -> 4 Stone Bricks',
    inputs: { stone: 4 },
    output: { itemType: 'stone_bricks', count: 4 },
  },
  {
    id: 'sandstone_from_sand',
    name: 'Chiseled Sandstone (x2)',
    description: '4 Sand -> 2 Sandstone',
    inputs: { sand: 4 },
    output: { itemType: 'sandstone', count: 2 },
  },
  {
    id: 'tnt_from_sand_coal',
    name: 'TNT Explosive (x2)',
    description: '2 Sand + 2 Coal Ore -> 2 TNT',
    inputs: { sand: 2, coal_ore: 2 },
    output: { itemType: 'tnt', count: 2 },
  },
  {
    id: 'bookshelf_from_planks',
    name: 'Bookshelf (x2)',
    description: '2 Oak Planks + 1 Wood -> 2 Bookshelf',
    inputs: { planks: 2, wood: 1 },
    output: { itemType: 'bookshelf', count: 2 },
  },
  {
    id: 'bricks_from_dirt_sand',
    name: 'Clay Bricks (x4)',
    description: '2 Dirt + 2 Sand -> 4 Clay Bricks',
    inputs: { dirt: 2, sand: 2 },
    output: { itemType: 'brick', count: 4 },
  },
  {
    id: 'bucket_from_iron',
    name: 'Empty Bucket (x1)',
    description: '3 Iron Ore -> 1 Empty Bucket',
    inputs: { iron_ore: 3 },
    output: { itemType: 'bucket_empty', count: 1 },
  },
];

export class InventorySystem {
  constructor(onChangeCallback) {
    this.onChangeCallback = onChangeCallback;

    // 36 slots: 0..8 are Hotbar, 9..35 are Backpack
    this.slots = new Array(TOTAL_SLOTS).fill(null);

    // 2x2 Crafting Grid (4 slots: 0..3)
    this.craftingSlots = [null, null, null, null];

    // Item stack currently held on the mouse cursor while dragging/rearranging inside Inventory UI
    this.cursorStack = null;

    this.isOpen = false;

    this.populateStarterKit();
  }

  /**
   * Populates the hotbar with an initial builder kit and fills backpack slots
   * with the full suite of Minecraft blocks so the player can immediately place & craft.
   */
  populateStarterKit() {
    this.slots.fill(null);
    const starterCounts = [32, 32, 32, 32, 24, 32, 24, 24, 24];
    const placeableDefs = BLOCK_DEFINITIONS.filter(
      (def) => def.id !== 'water' && def.id !== 'lava' && def.id !== 'bedrock'
    );
    placeableDefs.forEach((def, idx) => {
      if (idx < TOTAL_SLOTS) {
        this.slots[idx] = { itemType: def.id, count: starterCounts[idx] || 16 };
      }
    });
    this._notify();
  }

  _notify() {
    if (typeof this.onChangeCallback === 'function') {
      this.onChangeCallback(this);
    }
  }

  /**
   * Adds `count` of `itemType` into the inventory:
   * 1. First fills existing matching stacks with room (< MAX_STACK_SIZE).
   * 2. Then places remainder into the first empty slot (`null`).
   * Returns true if at least 1 item was added.
   */
  addItem(itemType, count = 1) {
    if (!itemType || count <= 0) return false;
    let remaining = count;
    const maxStack = BLOCK_BY_ID[itemType]?.maxStack || MAX_STACK_SIZE;

    // Pass 1: Stack onto existing matching slots
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemType === itemType && slot.count < maxStack) {
        const space = maxStack - slot.count;
        const toAdd = Math.min(space, remaining);
        slot.count += toAdd;
        remaining -= toAdd;
      }
    }

    // Pass 2: Place into empty slots
    for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
      if (!this.slots[i]) {
        const toAdd = Math.min(maxStack, remaining);
        this.slots[i] = { itemType, count: toAdd };
        remaining -= toAdd;
      }
    }

    this._notify();
    return remaining < count;
  }

  /**
   * Attempts to consume 1 item from the given hotbar index (0..8) when placing a block.
   * Returns the `itemType` string if consumed, or `null` if the slot is empty.
   */
  consumeHotbarSlot(hotbarIndex) {
    const slot = this.slots[hotbarIndex];
    if (!slot || slot.count <= 0) return null;

    const placedType = slot.itemType;
    slot.count -= 1;
    if (slot.count <= 0) {
      this.slots[hotbarIndex] = null;
    }

    this._notify();
    return placedType;
  }

  /**
   * Evaluates the current 2x2 `this.craftingSlots` against `CRAFTING_RECIPES`
   * using a generic data-driven matcher.
   */
  getMatchingRecipe() {
    // Tally non-empty item counts currently in the 2x2 grid
    const gridTotals = {};
    let distinctTypes = 0;

    for (const slot of this.craftingSlots) {
      if (slot && slot.count > 0) {
        if (!gridTotals[slot.itemType]) {
          gridTotals[slot.itemType] = 0;
          distinctTypes++;
        }
        gridTotals[slot.itemType] += slot.count;
      }
    }

    if (distinctTypes === 0) return null;

    for (const recipe of CRAFTING_RECIPES) {
      const reqTypes = Object.keys(recipe.inputs);
      if (reqTypes.length !== distinctTypes) continue;

      let matches = true;
      for (const type of reqTypes) {
        if ((gridTotals[type] || 0) < recipe.inputs[type]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return recipe;
      }
    }

    return null;
  }

  /**
   * Crafts 1 batch of the currently matched recipe, consuming ingredients from
   * `this.craftingSlots` and adding the output stack to the player's inventory.
   */
  craftMatchedOutput() {
    const recipe = this.getMatchingRecipe();
    if (!recipe) return false;

    // Deduct required counts across craftingSlots
    for (const [reqType, reqCount] of Object.entries(recipe.inputs)) {
      let toDeduct = reqCount;
      for (let i = 0; i < this.craftingSlots.length && toDeduct > 0; i++) {
        const slot = this.craftingSlots[i];
        if (slot && slot.itemType === reqType) {
          const take = Math.min(slot.count, toDeduct);
          slot.count -= take;
          toDeduct -= take;
          if (slot.count <= 0) {
            this.craftingSlots[i] = null;
          }
        }
      }
    }

    this.addItem(recipe.output.itemType, recipe.output.count);
    this._notify();
    return true;
  }

  /**
   * Convenience helper: auto-populates the 2x2 crafting grid from inventory for a clicked recipe card.
   */
  quickLoadRecipeFromInventory(recipeId) {
    // First return any existing items in the 2x2 crafting grid back to inventory
    this.returnCraftingGridToInventory();

    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;

    // Check if player owns enough of each required ingredient
    for (const [reqType, reqCount] of Object.entries(recipe.inputs)) {
      let available = 0;
      for (const s of this.slots) {
        if (s && s.itemType === reqType) available += s.count;
      }
      if (available < reqCount) return false;
    }

    // Pull ingredients into the 2x2 grid slots
    let gridIndex = 0;
    for (const [reqType, reqCount] of Object.entries(recipe.inputs)) {
      let remaining = reqCount;
      for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.itemType === reqType) {
          const take = Math.min(s.count, remaining);
          s.count -= take;
          remaining -= take;
          if (s.count <= 0) this.slots[i] = null;
        }
      }
      if (gridIndex < 4) {
        this.craftingSlots[gridIndex] = { itemType: reqType, count: reqCount };
        gridIndex++;
      }
    }

    this._notify();
    return true;
  }

  returnCraftingGridToInventory() {
    for (let i = 0; i < this.craftingSlots.length; i++) {
      const s = this.craftingSlots[i];
      if (s) {
        this.addItem(s.itemType, s.count);
        this.craftingSlots[i] = null;
      }
    }
    if (this.cursorStack) {
      this.addItem(this.cursorStack.itemType, this.cursorStack.count);
      this.cursorStack = null;
    }
    this._notify();
  }

  /**
   * Handles left/right click interaction on an inventory or crafting slot for click-to-move/split.
   */
  interactWithSlot(targetArray, index, button = 0) {
    const slot = targetArray[index];

    if (button === 2) {
      // Right-click: place 1 item from cursorStack, or split half of slot if cursorStack is empty
      if (!this.cursorStack && slot) {
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = { itemType: slot.itemType, count: half };
        slot.count -= half;
        if (slot.count <= 0) targetArray[index] = null;
      } else if (this.cursorStack) {
        if (!slot) {
          targetArray[index] = { itemType: this.cursorStack.itemType, count: 1 };
          this.cursorStack.count -= 1;
        } else if (
          slot.itemType === this.cursorStack.itemType &&
          slot.count < MAX_STACK_SIZE
        ) {
          slot.count += 1;
          this.cursorStack.count -= 1;
        }
        if (this.cursorStack.count <= 0) this.cursorStack = null;
      }
      this._notify();
      return;
    }

    // Left-click: pick up, place, merge, or swap stacks
    if (!this.cursorStack && slot) {
      this.cursorStack = { ...slot };
      targetArray[index] = null;
    } else if (this.cursorStack && !slot) {
      targetArray[index] = { ...this.cursorStack };
      this.cursorStack = null;
    } else if (this.cursorStack && slot) {
      if (slot.itemType === this.cursorStack.itemType && slot.count < MAX_STACK_SIZE) {
        const space = MAX_STACK_SIZE - slot.count;
        const move = Math.min(space, this.cursorStack.count);
        slot.count += move;
        this.cursorStack.count -= move;
        if (this.cursorStack.count <= 0) this.cursorStack = null;
      } else {
        // Swap stacks
        const temp = { ...slot };
        targetArray[index] = { ...this.cursorStack };
        this.cursorStack = temp;
      }
    }

    this._notify();
  }
}
