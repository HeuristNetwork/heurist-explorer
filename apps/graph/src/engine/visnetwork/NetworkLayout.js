/** Layout presets and bounded arrange-once movement for vis-network. */
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

/** Stable, centered grids; record-type groups occupy separated rectangular blocks. */
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

export class NetworkMovement {
  constructor(network) {
    this.network = network;
    this.pending = false;
    this.freeze = () => {
      if (!this.pending) return;
      this.pending = false;
      this.network.setOptions({ physics: { enabled: false } });
    };
    network.on('stabilized', this.freeze);
    network.on('stabilizationIterationsDone', this.freeze);
  }

  arrange(options) {
    this.pending = false;
    const physics = layoutOptions(options).physics;
    this.network.setOptions({ physics });
    if (physics === false || physics.enabled === false) return;
    if (options.movement === 'once') {
      this.pending = true;
      this.network.stabilize(500);
    } else {
      this.network.startSimulation();
    }
  }

  destroy() {
    this.pending = false;
    this.network.off('stabilized', this.freeze);
    this.network.off('stabilizationIterationsDone', this.freeze);
  }
}
