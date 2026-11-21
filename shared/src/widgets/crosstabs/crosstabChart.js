/**
 * @file crosstabChart.js
 * @brief The chart of a crosstab (plan 27q2 §7): Chart.js 4, loaded only when a chart is shown (its own chunk). Rows are
 *        the labels; one dataset per column (bar, stacked bar, horizontal bar, line); a pie / doughnut shows the row
 *        totals. Colours: a categorical palette, texts and grid in the colours of the page (`--h-*` variables).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Categorical colours of the datasets and slices. */
export const CHART_PALETTE = Object.freeze([
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#aec7e8'
]);

let loading = null;

/** Chart.js with the parts a crosstab uses (registered once). */
function loadChart() {
  loading ||= import('chart.js').then((module) => {
    const { Chart, BarController, LineController, PieController, DoughnutController, BarElement, LineElement, PointElement,
      ArcElement, CategoryScale, LinearScale, Legend, Tooltip, Title, Filler } = module;
    Chart.register(BarController, LineController, PieController, DoughnutController, BarElement, LineElement, PointElement,
      ArcElement, CategoryScale, LinearScale, Legend, Tooltip, Title, Filler);
    return Chart;
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * The Chart.js configuration of a crosstab chart.
 *
 * @param {string} type bar | stackedBar | horizontalBar | line | pie | doughnut.
 * @param {{labels: string[], datasets: Array<{label: string, data: Array<number|null>}>}} data crosstabChartData.
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {number[]} [options.totals] Row totals (the slices of a pie / doughnut).
 * @param {string} [options.totalsLabel]
 * @param {{text?: string, grid?: string}} [options.colors] Colours of texts and grid.
 * @param {(index: number, datasetIndex: number) => void} [options.onClick] A bar / point / slice: row index, dataset.
 * @returns {object}
 */
export function crosstabChartConfig(type, data, { title = '', totals = null, totalsLabel = '', colors = {}, onClick = null } = {}) {
  const round = type === 'pie' || type === 'doughnut';
  const datasets = round
    ? [{ label: totalsLabel, data: totals || data.datasets[0]?.data || [],
      backgroundColor: data.labels.map((label, index) => CHART_PALETTE[index % CHART_PALETTE.length]) }]
    : data.datasets.map((dataset, index) => {
      const color = CHART_PALETTE[index % CHART_PALETTE.length];
      return { ...dataset, backgroundColor: type === 'line' ? `${color}33` : color, borderColor: color, borderWidth: type === 'line' ? 2 : 0,
        fill: false, tension: 0.2 };
    });
  const text = colors.text || '#333';
  const grid = colors.grid || 'rgba(0,0,0,0.1)';
  const axis = (stacked) => ({ stacked, ticks: { color: text }, grid: { color: grid } });
  const stacked = type === 'stackedBar';
  return {
    type: round ? type : (type === 'line' ? 'line' : 'bar'),
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis: type === 'horizontalBar' ? 'y' : 'x',
      plugins: {
        legend: { display: round || datasets.length > 1 || Boolean(datasets[0]?.label), labels: { color: text } },
        title: { display: Boolean(title), text: title, color: text },
        tooltip: { enabled: true }
      },
      ...(round ? {} : { scales: { x: axis(stacked), y: { ...axis(stacked), beginAtZero: true } } }),
      onClick: onClick ? (event, elements) => {
        const [first] = elements || [];
        if (first) onClick(first.index, first.datasetIndex);
      } : undefined
    }
  };
}

/**
 * A chart in a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} config crosstabChartConfig.
 * @returns {Promise<{chart: object, update: (config: object) => void, png: () => string, destroy: () => void}>}
 */
export async function createCrosstabChart(canvas, config) {
  const Chart = await loadChart();
  let chart = new Chart(canvas, config);
  return {
    get chart() { return chart; },
    update(next) {
      chart.destroy();
      chart = new Chart(canvas, next);
    },
    png() {
      return chart.toBase64Image('image/png', 1);
    },
    destroy() {
      chart.destroy();
    }
  };
}

/**
 * Texts and grid colours of the page (`--h-color-text`, `--h-color-border`).
 *
 * @param {Element} element
 * @returns {{text: string, grid: string}}
 */
export function chartColors(element) {
  const style = globalThis.getComputedStyle?.(element);
  const read = (name) => style?.getPropertyValue?.(name)?.trim() || '';
  return { text: read('--h-color-text') || '#333', grid: read('--h-color-border') || 'rgba(0,0,0,0.1)' };
}
