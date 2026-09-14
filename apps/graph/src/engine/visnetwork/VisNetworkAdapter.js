/**
 * @file VisNetworkAdapter.js
 * @brief vis-network implementation of the graph engine contract.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DataSet, Network } from "vis-network/standalone";
import { GraphEngineAdapter } from "../GraphEngineAdapter.js";
import { NavControls } from "./NavControls.js";
import { layoutOptions, NetworkMovement, fixedPositions } from "./NetworkLayout.js";

/** Default label length; longer titles are truncated with an ellipsis. */
const DEFAULT_LABEL_MAX_LENGTH = 40;


export class VisNetworkAdapter extends GraphEngineAdapter {
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onNodeActivate,
    onPopupContentRequest,
  } = {}) {
    this.container = container;
    this.options = options;
    this.onSelectionChange = onSelectionChange;
    this.onNodeActivate = onNodeActivate;
    this.onPopupContentRequest = onPopupContentRequest;
    this.nodes = new DataSet();
    this.edges = new DataSet();
    // Human labels for edges, keyed by detail-type dty_ID / relation-type
    // trm_ID; populated by setEdgeLabels() after the app resolves them.
    this.edgeLabels = { fields: new Map(), relationTypes: new Map() };
    this.popup = null;
    this.popupGeneration = 0;
    this.popupAbortController = null;
    if (this.container && this.container.style && !this.container.style.position) {
      this.container.style.position = "relative";
    }
    this.network = new Network(
      container,
      { nodes: this.nodes, edges: this.edges },
      networkOptions(options),
    );
    this.movement = new NetworkMovement(this.network);
    this.network.on("doubleClick", ({ nodes }) => {
      if (nodes.length) this.onNodeActivate?.(Number(nodes[0]));
    });
    this.network.on("select", ({ nodes }) =>
      this.onSelectionChange?.(nodes.map(Number)),
    );
    this.network.on("click", ({ nodes, edges, pointer }) => {
      if (nodes.length) this.#showPopup(nodes[0], pointer.DOM);
      else if (edges.length) this.#showPopup(null, pointer.DOM, edges[0]);
      else this.#hidePopup();
    });
    this.network.on("dragStart", () => this.#hidePopup());
    this.network.on("zoom", () => this.#hidePopup());
    // Replaces vis-network's `interaction.navigationButtons` (PNG glyphs that
    // can't be recoloured or toggled individually) - see NavControls.js.
    this.navControls = new NavControls(container, this.network, () => this.rearrange());
    this.navControls.setVisibility(options.nativeControls);
  }

  async setGraph(graph) {
    this.savedPositions = {};
    this.nodes.clear();
    this.edges.clear();
    return this.mergeGraph(graph);
  }

  /** Reconcile membership without resetting the viewport or surviving nodes. */
  async syncGraph(graph) {
    this.savedPositions = { ...this.savedPositions, ...this.network.getPositions() };
    const nodes = new Set(graph.recordIds), edges = new Set(graph.edges.map(e => e.id));
    this.edges.remove(this.edges.getIds().filter(id => !edges.has(id)));
    this.nodes.remove(this.nodes.getIds().filter(id => !nodes.has(id)));
    await this.mergeGraph(graph);
    this.nodes.update(graph.recordIds.filter(id => this.savedPositions[id]).map(id => ({ id, ...this.savedPositions[id] })));
  }

  async mergeGraph(graph) {
    this.syncNodeGroups(graph.records);
    const maxLength =
      Number(this.options?.labelMaxLength) || DEFAULT_LABEL_MAX_LENGTH;
    const scalingEnabled = this.options?.scaling !== false;
    // vis-network only scales a node's size by its `value` field, computed
    // here as its connection count; the full (already-merged) graph is
    // supplied on every call, so degree is recomputed fresh each time.
    const degree = new Map();
    if (scalingEnabled) {
      for (const edge of graph.edges) {
        degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
      }
    }
    this.nodes.update(
      graph.records.map((record) => {
        const title = stripHtmlTags(record.title) || `Record ${record.id}`;
        const node = {
          id: record.id,
          label: this.options?.showNodeLabels === false ? "" : truncateLabel(title, maxLength),
          group: String(record.recordTypeId || "unknown"),
          color: this.getNodeColor(record.recordTypeId),
          // Full (tag-stripped) text: vis-network's built-in hover tooltip.
          title,
          recordTypeId: record.recordTypeId || null,
        };
        if (scalingEnabled) node.value = degree.get(record.id) || 0;
        return node;
      }),
    );
    this.edges.update(
      graph.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: this.#edgeLabel(edge),
        arrows: edge.relationshipId ? "to, from" : "to",
        dashes: Boolean(edge.relationshipId),
        // Provenance carried through for legend grouping, edge styling, and
        // re-labelling once vocabulary names arrive (see setEdgeLabels).
        link: edge.link || undefined,
        path: edge.path || undefined,
        fieldId: edge.fieldId || undefined,
        relationshipId: edge.relationshipId || undefined,
      })),
    );
    this.rearrange();
  }

  rearrange() {
    if (!this.nodes?.length) return;
    this.#hidePopup();
    this.movement?.arrange(this.options);
    const positions = fixedPositions(this.nodes.get(), this.options.layoutMode);
    if (positions.length) this.nodes.update(positions);
  }

  /**
   * Replace the numeric fallback labels with resolved detail-type and
   * relation-type names, on every edge already rendered.
   * @param {{fields: Map<number,string>, relationTypes: Map<number,string>}} labels
   */
  async setEdgeLabels(labels = {}) {
    this.edgeLabels = {
      fields: labels.fields instanceof Map ? labels.fields : new Map(),
      relationTypes:
        labels.relationTypes instanceof Map ? labels.relationTypes : new Map(),
    };
    if (!this.edges) return;
    this.edges.update(
      this.edges.get().map((edge) => ({
        id: edge.id,
        label: this.#edgeLabel(edge),
      })),
    );
  }

  /** Shared node fill for the canvas and legend, including configured colors. */
  getNodeColor(recordTypeId) {
    const palette = ['#97C2FC', '#FFFF00', '#FB7E81', '#7BE141', '#6E6EFD', '#C2FABC', '#FFA807', '#6E6EFD', '#FFC0CB', '#AD85E4'];
    const color = this.options?.groups?.[recordTypeId || 'unknown']?.color ?? this.options?.nodes?.color;
    return typeof color === 'string' ? color : color?.background || palette[Math.abs(Number(recordTypeId) || 0) % palette.length];
  }

  /** Pin group colors too: position-only and edge-triggered updates in
   * vis-network can reapply group defaults even when nodes have local colors. */
  syncNodeGroups(records) {
    this.nodeGroupStyles ||= new Map();
    const groups = {};
    for (const record of records) {
      const key = record.recordTypeId || 'unknown';
      const configured = this.options?.groups?.[key] || {};
      const color = configured.color ?? this.options?.nodes?.color ?? this.getNodeColor(record.recordTypeId);
      const style = { ...configured, color };
      const signature = JSON.stringify(style);
      if (this.nodeGroupStyles.get(key) === signature) continue;
      this.nodeGroupStyles.set(key, signature);
      groups[key] = style;
    }
    if (Object.keys(groups).length) this.network?.setOptions({ groups });
  }

  /** Name for an edge: relation type first, then detail type, then id. */
  #edgeLabel(edge) {
    return this.options?.showEdgeLabels === true ? this.#edgeName(edge) : "";
  }

  #edgeName(edge) {
    const relationshipId = edge.relationshipId || null;
    if (relationshipId && this.edgeLabels.relationTypes.get(relationshipId)) {
      return this.edgeLabels.relationTypes.get(relationshipId);
    }
    const fieldId = edge.fieldId || null;
    if (fieldId && this.edgeLabels.fields.get(fieldId)) {
      return this.edgeLabels.fields.get(fieldId);
    }
    return fieldId ? String(fieldId) : undefined;
  }

  /** Push updated options (gravity, scaling, labels, interaction, ...) to the live network. */
  async applyConfiguration(options = {}) {
    this.options = { ...this.options, ...options };
    this.network?.setOptions(networkOptions(this.options));
    this.nodeGroupStyles?.clear();
    this.syncNodeGroups(this.nodes?.get() || []);
    this.navControls?.setVisibility(this.options.nativeControls);
    this.rearrange();
  }

  async setSelection(recordIds) {
    if (!this.network || !this.nodes) return;
    // A selection driven by another widget's ON_REC_SELECT event may name
    // records this graph never loaded; vis-network throws for unknown node
    // ids, so only select the subset actually present.
    const ids = recordIds
      .map(Number)
      .filter((id) => this.nodes.get(id) != null);
    this.network.selectNodes(ids, false);
  }

  async fit() {
    this.network?.fit({ animation: true });
  }

  async resize() {
    // autoResize (set in networkOptions) already recalculates the canvas
    // size on its own; redraw() alone repaints at that size without forcing
    // a zoom-to-extent, which would jarringly reframe the view on every
    // unrelated layout resize (e.g. a sidebar toggle, or another widget's
    // search finishing). Use fit() explicitly when a reframe is wanted.
    this.network?.redraw();
  }

  async destroy() {
    this.#hidePopup();
    this.popupAbortController?.abort();
    this.popup?.remove();
    this.popup = null;
    this.navControls?.destroy();
    this.navControls = null;
    this.movement?.destroy();
    this.network?.destroy();
    this.network = null;
    this.nodes = null;
    this.edges = null;
  }

  /**
   * Show a custom popup for one node, positioned at its on-screen coordinates.
   *
   * vis-network's own `title` option only supports a hover tooltip (a plain
   * string or a DOM element vis-network inserts as-is - no built-in click
   * popup). A richer, click-triggered popup is built here instead.
   *
   * Content resolution, in order: `options.popupTemplate` (a Heurist report
   * template name, the same mechanism HRecordList uses for custom card/view
   * templates) fetched through `onPopupContentRequest` as server-rendered
   * HTML; else `options.popupRenderer(node)` for a caller-supplied DOM node;
   * else a small built-in title/type card. Set `options.customPopup: false`
   * to disable the click popup entirely and keep only the hover tooltip.
   */
  #showPopup(nodeId, position, edgeId = null) {
    if (this.options?.customPopup === false) return;
    // `popupEnabled` is the Configuration dialog's Interaction-section toggle
    // (`options.interaction.popupEnabled`); `customPopup` is the raw
    // engineOptions escape hatch. Either can disable the click popup; the
    // native hover tooltip (`interaction.hover`/`title`, below) is a wholly
    // separate vis-network feature and is never affected by this flag.
    if (this.options?.popupEnabled === false) return;
    const edge = edgeId == null ? null : this.edges?.get(edgeId);
    const node = edge || this.nodes?.get(nodeId);
    if (!node || !this.container) return;
    if (!this.popup) {
      this.popup = document.createElement("div");
      this.popup.className = "heurist-graph-popup";
      this.popup.hidden = true;
      this.container.appendChild(this.popup);
    }
    this.popupGeneration += 1;
    const generation = this.popupGeneration;
    this.popup.style.left = `${position.x}px`;
    this.popup.style.top = `${position.y}px`;
    this.popup.hidden = false;

    if (edge) {
      this.popupAbortController?.abort();
      const title = document.createElement('div');
      title.className = 'heurist-graph-popup-title';
      title.textContent = this.#edgeName(edge) || (edge.relationshipId ? 'Relationship' : 'Link');
      const endpoints = document.createElement('div');
      endpoints.textContent = (this.nodes.get(edge.from)?.title || edge.from) + (edge.relationshipId ? ' ↔ ' : ' → ') + (this.nodes.get(edge.to)?.title || edge.to);
      this.popup.replaceChildren(title, endpoints);
      return;
    }
    const template = this.options?.popupTemplate;
    if (template && typeof this.onPopupContentRequest === "function") {
      this.popup.replaceChildren(popupPlaceholderContent());
      this.popupAbortController?.abort();
      this.popupAbortController = new AbortController();
      Promise.resolve(
        this.onPopupContentRequest({
          recordId: nodeId,
          signal: this.popupAbortController.signal,
        }),
      )
        .then((html) => {
          if (generation !== this.popupGeneration || this.popup.hidden) return;
          if (html == null) this.popup.replaceChildren(this.#renderPopupContent(node));
          else this.popup.innerHTML = String(html);
        })
        .catch(() => {
          if (generation !== this.popupGeneration || this.popup.hidden) return;
          this.popup.replaceChildren(this.#renderPopupContent(node));
        });
      return;
    }
    this.popup.replaceChildren(this.#renderPopupContent(node));
  }

  #renderPopupContent(node) {
    const content =
      typeof this.options?.popupRenderer === "function"
        ? this.options.popupRenderer(node)
        : null;
    return content instanceof Node ? content : defaultPopupContent(node);
  }

  #hidePopup() {
    if (this.popup) this.popup.hidden = true;
    // Invalidate any in-flight popup content fetch so a slow response can
    // never overwrite a popup opened for a different node afterward.
    this.popupGeneration += 1;
    this.popupAbortController?.abort();
  }
}

/** Remove markup from a record title, collapsing the remaining whitespace. */
function stripHtmlTags(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate a label to `maxLength` characters, keeping whole words where possible. */
function truncateLabel(text, maxLength) {
  if (!maxLength || text.length <= maxLength) return text;
  const cut = text.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}

function defaultPopupContent(node) {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("div");
  title.className = "heurist-graph-popup-title";
  title.textContent = node.title || node.label || `Record ${node.id}`;
  fragment.append(title);
  const meta = document.createElement("div");
  meta.className = "heurist-graph-popup-meta";
  meta.textContent = node.recordTypeId
    ? `Record ${node.id} · Type ${node.recordTypeId}`
    : `Record ${node.id}`;
  fragment.append(meta);
  return fragment;
}

function popupPlaceholderContent() {
  const span = document.createElement("span");
  span.className = "heurist-graph-popup-loading";
  span.textContent = "…";
  return span;
}

function networkOptions(options) {
  const scalingEnabled = options.scaling !== false;
  const popupDelaySeconds = Number(options.popupDelay);
  return {
    autoResize: true,
    ...layoutOptions(options),
    interaction: {
      hover: true,
      // Custom pan/zoom overlay is rendered by NavControls instead - the
      // native buttons are un-styleable PNG glyphs.
      navigationButtons: false,
      keyboard: { enabled: true, bindToWindow: false },
      multiselect: true,
      tooltipDelay: popupDelaySeconds > 0 ? popupDelaySeconds * 1000 : 1000,
      hideEdgesOnDrag: false,
      // `selectionEnabled` is the Configuration dialog's Interaction-section
      // toggle; `options.interaction` below remains the raw vis-network
      // passthrough (e.g. a host overriding `multiselect`/`hideEdgesOnDrag`).
      selectable: options.selectionEnabled !== false,
      ...options.interaction,
    },
    nodes: {
      shape: "dot",
      size: 18,
      font: { size: 13, face: "Arial" },
      borderWidth: 1,
      borderWidthSelected: 3,
      shadow: false,
      ...(scalingEnabled ? { scaling: { min: 10, max: 30 } } : {}),
      ...options.nodes,
    },
    edges: {
      smooth: { type: "dynamic" },
      color: { color: "#8b9aaa", highlight: "#3762a6", hover: "#5a80b8" },
      width: 1,
      selectionWidth: 2,
      arrows: { to: { enabled: true, scaleFactor: 0.6 } },
      font: { size: 11, align: "middle" },
      ...options.edges,
    },
    ...(options.groups ? { groups: options.groups } : {}),
  };
}
