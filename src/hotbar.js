import { BLOCK_BY_ID, getBlockIconDataURL } from './blocks.js';
import { HOTBAR_SIZE, TOTAL_SLOTS, CRAFTING_RECIPES } from './inventory.js';

// ============================================================================
// Phases U4.2 & U6 — Pixel-Art HUD, Isometric 3D Block Icons & Inventory UI
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

    this.selectedIndex = 0;

    this._bindEvents();
    this.renderAll();
  }

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
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
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
    window.addEventListener('keydown', (event) => {
      // Ignore hotkeys if typing inside the '/' command console input
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }

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

    window.addEventListener('mousemove', (event) => {
      if (!this.inventory.isOpen || !this.cursorHeldEl) return;
      this.cursorHeldEl.style.left = `${event.clientX + 12}px`;
      this.cursorHeldEl.style.top = `${event.clientY + 12}px`;
    });

    const closeBtn = document.getElementById('close-inventory-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.toggleInventoryModal(false);
        this.domElement.requestPointerLock();
      });
    }
  }

  /**
   * Phase U6.3 — Uses cached isometric 3D cube icons rendered from each block's
   * top, sunlit left, and shaded right textures.
   */
  _createSlotMarkup(stack, keyBadge = null) {
    const keyHtml =
      keyBadge !== null ? `<span class="slot-key">${keyBadge}</span>` : '';

    if (!stack || stack.count <= 0) {
      return `${keyHtml}<div class="slot-empty"></div>`;
    }

    const block = BLOCK_BY_ID[stack.itemType];
    if (!block) return `${keyHtml}<div class="slot-empty"></div>`;

    const iconUrl = getBlockIconDataURL(block.id);

    return `
      ${keyHtml}
      <img class="iso-icon" data-block-id="${block.id}" src="${iconUrl}" alt="${block.name}" draggable="false" />
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
        this.hotbarLabel.textContent = `[${this.selectedIndex + 1}] ${b.name} (×${activeStack.count})`;
      } else {
        this.hotbarLabel.textContent = `[${this.selectedIndex + 1}] Empty Hand (Melee Attack: 4 DMG)`;
      }
    }
  }

  renderInventoryModal() {
    if (!this.inventory.isOpen) return;

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

    if (this.recipeListEl) {
      this.recipeListEl.innerHTML = '';
      for (const recipe of CRAFTING_RECIPES) {
        const outBlock = BLOCK_BY_ID[recipe.output.itemType];
        const iconUrl = getBlockIconDataURL(outBlock.id);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recipe-card';
        btn.innerHTML = `
          <img class="iso-icon small" src="${iconUrl}" alt="${outBlock.name}" />
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
