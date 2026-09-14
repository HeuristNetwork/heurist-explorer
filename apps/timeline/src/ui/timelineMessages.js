import { HMsg, $HR } from '#shared/ui';
export function showTimelineMessage(message, { error = false, title = error ? 'Timeline error' : 'Timeline warning' } = {}) {
  if (message?.name === 'AbortError') return;
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the timeline operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, { title, buttons: { OK: () => HMsg.closeMsgDlg() } });
}
