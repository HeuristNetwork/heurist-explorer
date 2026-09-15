/**
 * @file NetworkLayout.js
 * @brief Layout presets and bounded arrange-once movement for vis-network.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Build vis-network `layout`/`physics` options for a graph configuration.
 *
 * @param {object} [options] Graph engine options (`layoutMode`, `gravity`, `physics`, `layout`).
 * @returns {{layout: object, physics: object|false}} vis-network layout and physics options.
 */
export function layoutOptions(options = {}) {
  const fixedLayout = ['grid', 'record-types'].includes(options.layoutMode);
  const hierarchical = options.layoutMode?.startsWith('hierarchical-');
  const forceAtlas = options.layoutMode === 'forceAtlas2';
  const strength = { loose: 2, normal: 1, tight: 0.4 }[options.gravity] ?? 1;
  const solver = hierarchical ? 'hierarchicalRepulsion' : forceAtlas ? 'forceAtlas2Based' : 'barnesHut';
  const solverOptions = hierarchical
    ? { nodeDistance: 160, springLength: 150, avoidOverlap: 1 }
    : { gravitationalConstant: (forceAtlas ? -50 : -2000) * strength,
        centralGravity: forceAtlas ? 0.01 : 0.3, springLength: 120,
        springConstant: 0.04, damping: forceAtlas ? 0.4 : 0.09, avoidOverlap: 1 };
  return {
    layout: {
      ...options.layout,
      improvedLayout: !fixedLayout,
      hierarchical: { enabled: Boolean(hierarchical), direction: options.layoutMode === 'hierarchical-lr' ? 'LR' : 'UD',
        sortMethod: 'directed', levelSeparation: 180, nodeSpacing: 150, treeSpacing: 220 },
    },
    physics: fixedLayout || options.physics === false ? false : {
      enabled: true, solver, [solver]: solverOptions,
      stabilization: { enabled: true, iterations: 500, fit: false },
      ...(typeof options.physics === 'object' ? options.physics : {}),
    },
  };
}

/**
 * Stable, centered grids; record-type groups occupy separated rectangular blocks.
 *
 * @param {Array<{id: number|string, label?: string, recordTypeId?: number}>} nodes Nodes to position.
 * @param {string} mode Layout mode; positions are only computed for `'grid'` and `'record-types'`.
 * @returns {Array<{id: number|string, x: number, y: number}>} Computed positions, or `[]` for other modes or no nodes.
 */
export function fixedPositions(nodes, mode) {
  if (!nodes.length || !['grid', 'record-types'].includes(mode)) return [];
  const ordered = [...nodes].sort((a, b) => Number(a.id) - Number(b.id));
  const stepX = Math.max(160, ...ordered.map(node => String(node.label || '').length * 8 + 50));
  const stepY = 110;
  const groups = new Map();
  for (const node of ordered) {
    const key = mode === 'grid' ? 0 : Number(node.recordTypeId) || 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const blocks = [...groups.entries()].sort(([a], [b]) => a - b).map(([, members]) => {
    const columns = Math.ceil(Math.sqrt(members.length));
    return { members, columns, rows: Math.ceil(members.length / columns) };
  });
  const blockColumns = Math.ceil(Math.sqrt(blocks.length));
  const blockWidth = Math.max(...blocks.map(block => block.columns)) * stepX + stepX;
  const blockHeight = Math.max(...blocks.map(block => block.rows)) * stepY + stepY;
  const positions = blocks.flatMap((block, index) => block.members.map((node, offset) => ({
    id: node.id,
    x: (index % blockColumns) * blockWidth + (offset % block.columns) * stepX,
    y: Math.floor(index / blockColumns) * blockHeight + Math.floor(offset / block.columns) * stepY,
  })));
  const centerX = Math.max(...positions.map(node => node.x)) / 2;
  const centerY = Math.max(...positions.map(node => node.y)) / 2;
  return positions.map(node => ({ ...node, x: node.x - centerX, y: node.y - centerY }));
}

/** Freezes physics once vis-network reports stabilization, and can trigger a single bounded re-arrangement. */
export class NetworkMovement {
  /**
   * @param {object} network vis-network `Network` instance to control.
   */
  constructor(network) {
    this.network = network;
    this.pending = false;
    this.onSettleOnce = null;
    this.freeze = () => {
      if (!this.pending) return;
      this.pending = false;
      this.network.setOptions({ physics: { enabled: false } });
      const onSettle = this.onSettleOnce;
      this.onSettleOnce = null;
      onSettle?.();
    };
    network.on('stabilized', this.freeze);
    network.on('stabilizationIterationsDone', this.freeze);
  }

  /**
   * Apply layout physics for the given options, running a bounded stabilization or continuous simulation.
   *
   * A bounded ('once') stabilization settles asynchronously - fitting the
   * viewport before it completes would frame the pre-stabilization positions,
   * not the final layout. Pass `onSettle` to run once physics actually
   * freezes (or immediately, when there is nothing to stabilize).
   *
   * @param {object} options Graph engine options; see `layoutOptions`.
   * @param {Function} [onSettle] Called once the layout has settled.
   * @returns {void}
   */
  arrange(options, onSettle) {
    this.pending = false;
    this.onSettleOnce = null;
    const physics = layoutOptions(options).physics;
    this.network.setOptions({ physics });
    if (physics === false || physics.enabled === false) {
      onSettle?.();
      return;
    }
    if (options.movement === 'once') {
      this.pending = true;
      this.onSettleOnce = onSettle || null;
      this.network.stabilize(500);
    } else {
      // Continuous movement never freezes/settles on its own; there is no
      // "final" layout to wait for, so fit against the current positions.
      this.network.startSimulation();
      onSettle?.();
    }
  }

  /**
   * Detach stabilization listeners.
   *
   * @returns {void}
   */
  destroy() {
    this.pending = false;
    this.onSettleOnce = null;
    this.network.off('stabilized', this.freeze);
    this.network.off('stabilizationIterationsDone', this.freeze);
  }
}
