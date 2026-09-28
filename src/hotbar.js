import { BLOCK_BY_ID } from './blocks.js';
import { HOTBAR_SIZE, TOTAL_SLOTS, CRAFTING_RECIPES } from './inventory.js';

// ============================================================================
// Phase 4 (Part 4A) — Hotbar UI (with Stack Counts) & Full Inventory/Crafting Modal
// ============================================================================

export class HotbarAndInventoryUI {
  constructor(inventory, domElement, onModalStateChange) {
    this.inventory = inventory;
    this.domElement = domElement;
    this.onModalStateChange = onModalStateChange;

    this.hotbarContainer = document.getElementById('hotbar-container');
    this.hotbarLabel = document.getElementById('hotbar-active-label');
    this.modalEl = document.getElementById('inventory-modal');
    this.backpackGridEl = document.getElementById('backpack-grid');
    this.modalHotbarGridEl = document.getElementById('modal-hotbar-grid');
    this.craftingGridEl = document.getElementById('crafting-grid');
    this.craftOutputEl = document.getElementById('craft-output-slot');
    this.recipeListEl = document.getElementById('recipe-book-list');
    this.cursorHeldEl = document.getElementById('cursor-held-item');

    this.selectedIndex = 0; // 0..8

    this._bindEvents();
    this.renderAll();
  }

  /**
   * Returns the stack object `{ itemType, count }` in the active hotbar slot, or `null`.
   */
  getSelectedStack() {
    return this.inventory.slots[this.selectedIndex] || null;
  }

  selectSlot(index) {
    this.selectedIndex = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.renderHotbar();
  }

  toggleInventoryModal(forceState) {
    const nextState =
      typeof forceState === 'boolean' ? forceState : !this.inventory.isOpen;
    this.inventory.isOpen = nextState;

    if (this.modalEl) {
      this.modalEl.classList.toggle('hidden', !nextState);
    }

    if (nextState) {
      // Opening inventory -> release Pointer Lock so mouse is usable for UI interaction
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
      // Closing inventory -> return any held/crafting items safely to backpack
      this.inventory.returnCraftingGridToInventory();
      if (this.cursorHeldEl) {
        this.cursorHeldEl.classList.add('hidden');
      }
    }

    if (typeof this.onModalStateChange === 'function') {
      this.onModalStateChange(nextState);
    }

    this.renderAll();
  }

  _bindEvents() {
    // Keybinds: 1–9 for hotbar slots, 'E' to toggle Inventory & Crafting modal
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') {
        event.preventDefault();
        this.toggleInventoryModal();
        return;
      }

      if (event.code === 'Escape' && this.inventory.isOpen) {
        this.toggleInventoryModal(false);
        return;
      }

      if (!this.inventory.isOpen && event.code.startsWith('Digit')) {
        const num = Number(event.code.replace('Digit', ''));
        if (num >= 1 && num <= HOTBAR_SIZE) {
          this.selectSlot(num - 1);
        }
      }
    });

    // Mouse scroll wheel cycles through hotbar slots when inventory modal is closed
    window.addEventListener(
      'wheel',
      (event) => {
        if (this.inventory.isOpen) return;
        if (event.deltaY > 0) {
          this.selectSlot(this.selectedIndex + 1);
        } else if (event.deltaY < 0) {
          this.selectSlot(this.selectedIndex - 1);
        }
      },
      { passive: true }
    );

    // Track cursor position for floating held item preview inside Inventory modal
    window.addEventListener('mousemove', (event) => {
      if (!this.inventory.isOpen || !this.cursorHeldEl) return;
      this.cursorHeldEl.style.left = `${event.clientX + 12}px`;
      this.cursorHeldEl.style.top = `${event.clientY + 12}px`;
    });

    // Close button inside modal
    const closeBtn = document.getElementById('close-inventory-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.toggleInventoryModal(false);
        this.domElement.requestPointerLock();
      });
    }
  }

  _createSlotMarkup(stack, keyBadge = null) {
    const keyHtml =
      keyBadge !== null ? `<span class="slot-key">${keyBadge}</span>` : '';

    if (!stack || stack.count <= 0) {
      return `${keyHtml}<div class="slot-empty"></div>`;
    }

    const block = BLOCK_BY_ID[stack.itemType];
    if (!block) return `${keyHtml}<div class="slot-empty"></div>`;

    return `
      ${keyHtml}
      <div class="slot-swatch">
        <div class="swatch-top" style="background: ${block.colorHex};"></div>
        <div class="swatch-side" style="background: ${block.sideHex};"></div>
      </div>
      <span class="slot-name">${block.name.split(' ')[0]}</span>
      <span class="slot-count">${stack.count}</span>
    `;
  }

  renderHotbar() {
    if (!this.hotbarContainer) return;
    this.hotbarContainer.innerHTML = '';

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const stack = this.inventory.slots[i];
      const slotEl = document.createElement('div');
      slotEl.className = `hotbar-slot ${i === this.selectedIndex ? 'active' : ''}`;
      slotEl.innerHTML = this._createSlotMarkup(stack, i + 1);

      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectSlot(i);
      });

      this.hotbarContainer.appendChild(slotEl);
    }

    const activeStack = this.getSelectedStack();
    if (this.hotbarLabel) {
      if (activeStack && BLOCK_BY_ID[activeStack.itemType]) {
        const b = BLOCK_BY_ID[activeStack.itemType];
        this.hotbarLabel.textContent = `Slot [${this.selectedIndex + 1}]: ${b.name} (×${activeStack.count}) • Press [E] for Inventory & Crafting`;
      } else {
        this.hotbarLabel.textContent = `Slot [${this.selectedIndex + 1}]: Empty • Press [E] for Inventory & Crafting`;
      }
    }
  }

  renderInventoryModal() {
    if (!this.inventory.isOpen) return;

    // 1. Render 2x2 Crafting Grid (4 slots)
    if (this.craftingGridEl) {
      this.craftingGridEl.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const stack = this.inventory.craftingSlots[i];
        const cell = document.createElement('div');
        cell.className = 'inv-slot craft-input-slot';
        cell.innerHTML = this._createSlotMarkup(stack);
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.inventory.interactWithSlot(this.inventory.craftingSlots, i, e.button);
        });
        this.craftingGridEl.appendChild(cell);
      }
    }

    // 2. Render Crafting Output Slot
    if (this.craftOutputEl) {
      const matchedRecipe = this.inventory.getMatchingRecipe();
      this.craftOutputEl.innerHTML = '';
      if (matchedRecipe) {
        this.craftOutputEl.classList.add('craftable');
        this.craftOutputEl.innerHTML = this._createSlotMarkup(matchedRecipe.output);
        this.craftOutputEl.title = `Click to craft: ${matchedRecipe.name}`;
      } else {
        this.craftOutputEl.classList.remove('craftable');
        this.craftOutputEl.innerHTML = `<div class="slot-empty"></div>`;
        this.craftOutputEl.title = 'Place matching items in the 2x2 grid or click a Recipe on the right';
      }

      this.craftOutputEl.onclick = (e) => {
        e.stopPropagation();
        this.inventory.craftMatchedOutput();
      };
    }

    // 3. Render Data-Driven Recipe Book Helper
    if (this.recipeListEl) {
      this.recipeListEl.innerHTML = '';
      for (const recipe of CRAFTING_RECIPES) {
        const outBlock = BLOCK_BY_ID[recipe.output.itemType];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recipe-card';
        btn.innerHTML = `
          <div class="slot-swatch small-swatch">
            <div class="swatch-top" style="background: ${outBlock.colorHex};"></div>
            <div class="swatch-side" style="background: ${outBlock.sideHex};"></div>
          </div>
          <div class="recipe-meta">
            <strong>${recipe.name}</strong>
            <span>${recipe.description}</span>
          </div>
        `;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const loaded = this.inventory.quickLoadRecipeFromInventory(recipe.id);
          if (loaded) {
            this.inventory.craftMatchedOutput();
          }
        });
        this.recipeListEl.appendChild(btn);
      }
    }

    // 4. Render 27 Backpack Slots (indices 9..35)
    if (this.backpackGridEl) {
      this.backpackGridEl.innerHTML = '';
      for (let i = HOTBAR_SIZE; i < TOTAL_SLOTS; i++) {
        const stack = this.inventory.slots[i];
        const cell = document.createElement('div');
        cell.className = 'inv-slot';
        cell.innerHTML = this._createSlotMarkup(stack);
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.inventory.interactWithSlot(this.inventory.slots, i, e.button);
        });
        this.backpackGridEl.appendChild(cell);
      }
    }

    // 5. Render 9 Hotbar Slots inside Modal (indices 0..8)
    if (this.modalHotbarGridEl) {
      this.modalHotbarGridEl.innerHTML = '';
      for (let i = 0; i < HOTBAR_SIZE; i++) {
        const stack = this.inventory.slots[i];
        const cell = document.createElement('div');
        cell.className = `inv-slot ${i === this.selectedIndex ? 'active' : ''}`;
        cell.innerHTML = this._createSlotMarkup(stack, i + 1);
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.inventory.interactWithSlot(this.inventory.slots, i, e.button);
        });
        this.modalHotbarGridEl.appendChild(cell);
      }
    }

    // 6. Update floating cursor stack preview
    if (this.cursorHeldEl) {
      if (this.inventory.cursorStack) {
        this.cursorHeldEl.classList.remove('hidden');
        this.cursorHeldEl.innerHTML = this._createSlotMarkup(this.inventory.cursorStack);
      } else {
        this.cursorHeldEl.classList.add('hidden');
      }
    }
  }

  renderAll() {
    this.renderHotbar();
    this.renderInventoryModal();
  }
}
