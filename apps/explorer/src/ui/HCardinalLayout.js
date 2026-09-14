/**
 * @file HCardinalLayout.js
 * @brief Generic five-region resizable cardinal layout widget.
 *
 * HCardinalLayout owns geometry only. It knows nothing about Explorer module
 * types or DataSources. LayoutManager assigns semantic modules to its regions.
 */
import './HCardinalLayout.css';

const REGIONS = ['north', 'west', 'center', 'east', 'south'];
const EDGE_REGIONS = ['north', 'west', 'east', 'south'];

const DEFAULT_OPTIONS = {
    northSize: 140,
    westSize: null,
    eastSize: 300,
    southSize: 240,
    collapsedSize: 26,
    splitterSize: 7,
    minNorth: 80,
    minWest: 250,
    minEast: 180,
    minSouth: 120,
    minCenterWidth: 240,
    minCenterHeight: 180
};

/**
 * Controls north, west, center, east and south layout regions.
 *
 * Public state distinguishes three conditions:
 * - visible and expanded;
 * - visible and collapsed (edge regions only);
 * - hidden, where the region consumes no layout space.
 */
export class HCardinalLayout extends EventTarget {
    /**
     * @param {HTMLElement} container Parent element that will contain the layout.
     * @param {object} [options] Size and minimum-size overrides.
     */
    constructor(container, options = {}) {
        super();

        if (!(container instanceof HTMLElement)) {
            throw new TypeError('HCardinalLayout container must be an HTMLElement');
        }

        this.container = container;
        const visibleWidth = container.getBoundingClientRect().width
            || container.clientWidth
            || globalThis.innerWidth
            || 960;
        const defaults = {
            ...DEFAULT_OPTIONS,
            westSize: Math.max(DEFAULT_OPTIONS.minWest, Math.round(visibleWidth / 3))
        };
        this.options = { ...defaults, ...options };
        this.regions = new Map();
        this.splitters = new Map();
        this._focusSnapshot = null;
        this._drag = null;
        this._dragVeil = null;

        this.state = {
            north: regionState(false, false, this.options.northSize),
            west: regionState(true, false, this.options.westSize),
            center: regionState(true, false, null),
            east: regionState(false, false, this.options.eastSize),
            south: regionState(false, false, this.options.southSize),
            focused: null
        };

        this._build();
        this._applyState();
    }

    /**
     * Sets the DOM content for a region.
     *
     * @param {'north'|'west'|'center'|'east'|'south'} region Region name.
     * @param {Node|null} content Content node, or null to empty the region.
     * @returns {HTMLElement} Region host element.
     */
    setContent(region, content) {
        const element = this._region(region);
        element.replaceChildren();

        if (content instanceof Node) {
            element.append(content);
        }

        return element;
    }

    /**
     * Returns the first content node assigned to a region.
     *
     * @param {string} region Region name.
     * @returns {Node|null}
     */
    getContent(region) {
        return this._region(region).firstChild || null;
    }

    /**
     * Returns the region host element.
     *
     * @param {string} region Region name.
     * @returns {HTMLElement}
     */
    getRegionElement(region) {
        return this._region(region);
    }

    /**
     * Makes a region part of the layout.
     *
     * @param {string} region Region name.
     * @returns {boolean} True when state changed.
     */
    show(region) {
        this._assertRegion(region);

        if (this.state[region].visible) {
            return false;
        }

        this.state[region].visible = true;
        this._applyState();
        this._emit('regionvisibilitychange', { region, visible: true });
        return true;
    }

    /**
     * Removes a region from layout completely.
     *
     * Center may be hidden just like any other region. When hidden, no center
     * space is reserved and visible west/east regions expand into the free area.
     *
     * @param {string} region Region name.
     * @returns {boolean} True when state changed.
     */
    hide(region) {
        this._assertRegion(region);

        if (!this.state[region].visible) {
            return false;
        }

        this.state[region].visible = false;
        this._applyState();
        this._emit('regionvisibilitychange', { region, visible: false });
        return true;
    }

    /**
     * Collapses an edge region to the configured narrow restore strip.
     * Center cannot be collapsed; use hide('center') instead.
     *
     * @param {string} region Edge region name.
     * @returns {boolean} True when state changed.
     */
    collapse(region) {
        this._assertEdgeRegion(region);

        if (this.state[region].collapsed) {
            return false;
        }

        this.state[region].visible = true;
        this.state[region].collapsed = true;
        this._applyState();
        this._emit('regioncollapsechange', { region, collapsed: true });
        return true;
    }

    /**
     * Expands a collapsed edge region.
     *
     * @param {string} region Edge region name.
     * @returns {boolean} True when state changed.
     */
    expand(region) {
        this._assertEdgeRegion(region);

        if (!this.state[region].collapsed && this.state[region].visible) {
            return false;
        }

        this.state[region].visible = true;
        this.state[region].collapsed = false;
        this._applyState();
        this._emit('regioncollapsechange', { region, collapsed: false });
        return true;
    }

    /**
     * Toggles collapse state for an edge region.
     *
     * @param {string} region Edge region name.
     * @returns {boolean} New collapsed state.
     */
    toggle(region) {
        this._assertEdgeRegion(region);

        if (this.state[region].collapsed) {
            this.expand(region);
        } else {
            this.collapse(region);
        }

        return this.state[region].collapsed;
    }

    /**
     * Sets preferred expanded size in pixels for an edge region.
     *
     * @param {string} region Edge region name.
     * @param {number} pixels Requested size.
     * @returns {number} Applied size.
     */
    setSize(region, pixels) {
        this._assertEdgeRegion(region);

        const size = this._clampRegionSize(region, Number(pixels));
        this.state[region].size = size;
        this._applyState();
        this._emit('regionresize', { region, size });
        return size;
    }

    /**
     * Returns configured expanded size for an edge region.
     *
     * @param {string} region Edge region name.
     * @returns {number|null}
     */
    getSize(region) {
        this._assertRegion(region);
        return this.state[region].size ?? null;
    }

    /**
     * Temporarily focuses one visible region over the full layout.
     * Previous state is preserved exactly for restoreFocus().
     *
     * @param {string} region Region name.
     * @returns {boolean} True when focus mode changed.
     */
    focus(region) {
        this._assertRegion(region);

        if (!this.state[region].visible || this.state.focused === region) {
            return false;
        }

        if (!this._focusSnapshot) {
            this._focusSnapshot = this.getState();
        }

        this.state.focused = region;
        this._applyState();
        this._emit('focuschange', { region, focused: true });
        return true;
    }

    /**
     * Restores layout state saved by focus().
     *
     * @returns {boolean} True when focus mode was restored.
     */
    restoreFocus() {
        if (!this._focusSnapshot) {
            return false;
        }

        const snapshot = this._focusSnapshot;
        this._focusSnapshot = null;
        this.setState(snapshot, { preserveFocusSnapshot: true });
        this._emit('focuschange', { region: snapshot.focused || null, focused: false });
        return true;
    }

    /**
     * Returns a serializable copy of current geometry state.
     *
     * @returns {object}
     */
    getState() {
        return cloneState(this.state);
    }

    /**
     * Applies a previously captured geometry state.
     *
     * @param {object} state State returned by getState().
     * @param {object} [options] Internal restore options.
     * @returns {HCardinalLayout}
     */
    setState(state = {}, options = {}) {
        for (const region of REGIONS) {
            const incoming = state[region];

            if (!incoming || typeof incoming !== 'object') {
                continue;
            }

            this.state[region].visible = incoming.visible !== false;
            this.state[region].collapsed = EDGE_REGIONS.includes(region)
                ? incoming.collapsed === true
                : false;

            if (EDGE_REGIONS.includes(region) && Number.isFinite(Number(incoming.size))) {
                this.state[region].size = this._clampRegionSize(region, Number(incoming.size));
            }
        }

        this.state.focused = REGIONS.includes(state.focused) ? state.focused : null;

        if (!options.preserveFocusSnapshot) {
            this._focusSnapshot = null;
        }

        this._applyState();
        this._emit('layoutchange', { state: this.getState() });
        return this;
    }

    /**
     * Re-applies current dimensions, e.g. after the outer container changes.
     *
     * @returns {HCardinalLayout}
     */
    resize() {
        this._applyState();
        this._emit('layoutchange', { state: this.getState() });
        return this;
    }

    /**
     * Removes listeners and generated layout DOM.
     */
    destroy() {
        this._stopDrag();
        window.removeEventListener('resize', this._onWindowResize);
        this.root.remove();
        this.regions.clear();
        this.splitters.clear();
    }

    _build() {
        this.root = document.createElement('div');
        this.root.className = 'h-cardinal-layout';

        this._dragVeil = document.createElement('div');
        this._dragVeil.className = 'h-cardinal-drag-veil';
        this._dragVeil.hidden = true;

        this.middle = document.createElement('div');
        this.middle.className = 'h-cardinal-middle';

        this._appendRegion(this.root, 'north');
        this.root.append(this._createSplitter('north'));

        this._appendRegion(this.middle, 'west');
        this.middle.append(this._createSplitter('west'));
        this._appendRegion(this.middle, 'center');
        this.middle.append(this._createSplitter('east'));
        this._appendRegion(this.middle, 'east');

        this.root.append(this.middle);
        this.root.append(this._createSplitter('south'));
        this._appendRegion(this.root, 'south');
        this.root.append(this._dragVeil);

        this.container.replaceChildren(this.root);

        this._onWindowResize = () => this.resize();
        window.addEventListener('resize', this._onWindowResize);
    }

    _appendRegion(parent, region) {
        const element = document.createElement('section');
        element.className = `h-cardinal-region h-cardinal-${region}`;
        element.dataset.region = region;
        parent.append(element);
        this.regions.set(region, element);
    }

    _createSplitter(region) {
        const splitter = document.createElement('div');
        splitter.className = `h-cardinal-splitter h-cardinal-splitter-${region}`;
        splitter.dataset.region = region;
        splitter.setAttribute('role', 'separator');
        splitter.tabIndex = 0;

        const orientation = region === 'west' || region === 'east'
            ? 'vertical'
            : 'horizontal';
        splitter.setAttribute('aria-orientation', orientation);

        splitter.addEventListener('pointerdown', (event) => this._startDrag(event, region));
        splitter.addEventListener('dblclick', () => this.toggle(region));
        splitter.addEventListener('keydown', (event) => this._handleSplitterKey(event, region));

        this.splitters.set(region, splitter);
        return splitter;
    }

    _startDrag(event, region) {
        if (!this.state[region].visible || this.state[region].collapsed) {
            return;
        }

        event.preventDefault();

        this._drag = {
            region,
            startX: event.clientX,
            startY: event.clientY,
            startSize: this.state[region].size
        };

        this._showDragVeil(region);

        this._onPointerMove = (moveEvent) => this._dragResize(moveEvent);
        this._onPointerUp = () => this._stopDrag();
        document.addEventListener('pointermove', this._onPointerMove);
        document.addEventListener('pointerup', this._onPointerUp, { once: true });
        document.addEventListener('pointercancel', this._onPointerUp, { once: true });
        document.body.classList.add('h-cardinal-resizing');
    }

    _dragResize(event) {
        if (!this._drag) {
            return;
        }

        const { region, startX, startY, startSize } = this._drag;
        let delta = 0;

        if (region === 'west') {
            delta = event.clientX - startX;
        } else if (region === 'east') {
            delta = startX - event.clientX;
        } else if (region === 'north') {
            delta = event.clientY - startY;
        } else if (region === 'south') {
            delta = startY - event.clientY;
        }

        const size = this._clampRegionSize(region, startSize + delta);
        this.state[region].size = size;
        this._applyState();
        this._emit('regionresize', { region, size, interactive: true });
    }

    _stopDrag() {
        if (this._onPointerMove) {
            document.removeEventListener('pointermove', this._onPointerMove);
        }

        if (this._onPointerUp) {
            document.removeEventListener('pointerup', this._onPointerUp);
            document.removeEventListener('pointercancel', this._onPointerUp);
        }

        this._hideDragVeil();

        this._onPointerMove = null;
        this._onPointerUp = null;
        this._drag = null;
        document.body?.classList.remove('h-cardinal-resizing');
    }


    _showDragVeil(region) {
        if (!this._dragVeil) {
            return;
        }

        const horizontal = region === 'west' || region === 'east';
        this._dragVeil.style.cursor = horizontal ? 'col-resize' : 'row-resize';
        this._dragVeil.hidden = false;
    }

    _hideDragVeil() {
        if (!this._dragVeil) {
            return;
        }

        this._dragVeil.hidden = true;
        this._dragVeil.style.removeProperty('cursor');
    }

    _handleSplitterKey(event, region) {
        const horizontal = region === 'west' || region === 'east';
        const decrementKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const incrementKey = horizontal ? 'ArrowRight' : 'ArrowDown';

        if (event.key !== decrementKey && event.key !== incrementKey) {
            return;
        }

        event.preventDefault();
        const direction = event.key === incrementKey ? 1 : -1;
        const signedDirection = region === 'east' || region === 'south'
            ? -direction
            : direction;
        this.setSize(region, this.state[region].size + (signedDirection * 16));
    }

    _applyState() {
        for (const region of REGIONS) {
            const element = this.regions.get(region);
            const regionStateValue = this.state[region];
            const focused = this.state.focused;
            const visible = focused ? focused === region : regionStateValue.visible;

            element.hidden = !visible;
            element.classList.toggle('is-collapsed', regionStateValue.collapsed);
        }

        for (const region of EDGE_REGIONS) {
            const splitter = this.splitters.get(region);
            const regionStateValue = this.state[region];
            const focused = this.state.focused;
            let visible = !focused && regionStateValue.visible;

            if (!this.state.center.visible && region === 'east' && this.state.west.visible) {
                visible = false;
            }

            splitter.hidden = !visible;
        }

        const north = this._effectiveSize('north');
        const west = this._effectiveSize('west');
        const east = this._effectiveSize('east');
        const south = this._effectiveSize('south');
        const splitter = this.options.splitterSize;
        const focused = this.state.focused;

        if (focused) {
            if (focused === 'north') {
                this.root.style.gridTemplateRows = '1fr 0 0 0 0';
            } else if (focused === 'south') {
                this.root.style.gridTemplateRows = '0 0 0 0 1fr';
            } else {
                this.root.style.gridTemplateRows = '0 0 1fr 0 0';
            }

            this.middle.style.gridTemplateColumns = focused === 'west'
                ? '1fr 0 0 0 0'
                : focused === 'east'
                    ? '0 0 0 0 1fr'
                    : '0 0 1fr 0 0';
            return;
        }

        const northSplitter = this.state.north.visible ? splitter : 0;
        const southSplitter = this.state.south.visible ? splitter : 0;
        this.root.style.gridTemplateRows = `${north}px ${northSplitter}px minmax(0, 1fr) ${southSplitter}px ${south}px`;

        const westVisible = this.state.west.visible;
        const centerVisible = this.state.center.visible;
        const eastVisible = this.state.east.visible;
        const westSplitter = westVisible && (centerVisible || eastVisible) ? splitter : 0;
        const eastSplitter = centerVisible && eastVisible ? splitter : 0;

        let centerTrack = centerVisible ? 'minmax(0, 1fr)' : '0';
        let westTrack = westVisible ? `${west}px` : '0';
        let eastTrack = eastVisible ? `${east}px` : '0';

        if (!centerVisible) {
            if (westVisible && eastVisible) {
                westTrack = `minmax(0, ${Math.max(1, west)}fr)`;
                eastTrack = `minmax(0, ${Math.max(1, east)}fr)`;
            } else if (westVisible) {
                westTrack = 'minmax(0, 1fr)';
            } else if (eastVisible) {
                eastTrack = 'minmax(0, 1fr)';
            }
        }

        this.middle.style.gridTemplateColumns = `${westTrack} ${westSplitter}px ${centerTrack} ${eastSplitter}px ${eastTrack}`;
    }

    _effectiveSize(region) {
        const value = this.state[region];

        if (!value.visible) {
            return 0;
        }

        return value.collapsed ? this.options.collapsedSize : value.size;
    }

    _clampRegionSize(region, value) {
        const minimums = {
            north: this.options.minNorth,
            west: this.options.minWest,
            east: this.options.minEast,
            south: this.options.minSouth
        };

        const minimum = minimums[region] || 0;

        if (!Number.isFinite(value)) {
            return minimum;
        }

        const bounds = this.container.getBoundingClientRect();
        const horizontal = region === 'west' || region === 'east';
        const available = horizontal ? bounds.width : bounds.height;
        const centerMinimum = horizontal
            ? this.options.minCenterWidth
            : this.options.minCenterHeight;
        const maximum = Math.max(minimum, available - centerMinimum - this.options.splitterSize);

        return Math.max(minimum, Math.min(value, maximum));
    }

    _region(region) {
        this._assertRegion(region);
        return this.regions.get(region);
    }

    _assertRegion(region) {
        if (!REGIONS.includes(region)) {
            throw new RangeError(`Unknown cardinal region: ${region}`);
        }
    }

    _assertEdgeRegion(region) {
        if (!EDGE_REGIONS.includes(region)) {
            throw new RangeError(`Region cannot be collapsed or resized: ${region}`);
        }
    }

    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

function regionState(visible, collapsed, size) {
    return { visible, collapsed, size };
}

function cloneState(state) {
    return {
        north: { ...state.north },
        west: { ...state.west },
        center: { ...state.center },
        east: { ...state.east },
        south: { ...state.south },
        focused: state.focused || null
    };
}
