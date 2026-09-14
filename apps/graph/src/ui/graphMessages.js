import { HMsg, $HR } from '#shared/ui';

// Keep server and user-supplied message text out of HMsg's HTML string path.
export function showGraphMessage(message, { error = false, title = error ? 'Graph error' : 'Graph warning' } = {}) {
  if (message?.name === 'AbortError') return;
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the graph operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, { title, buttons: { OK: () => HMsg.closeMsgDlg() } });
}
