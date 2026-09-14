import { HMsg, $HR } from '#shared/ui';

// Pass plain content as an element: server error text must not become HTML.
export function showMapMessage(message, { error = false, title = 'Map warning' } = {}) {
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the map operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, {
    title, buttons: { OK: () => HMsg.closeMsgDlg() }
  });
}
