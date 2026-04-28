/**
 * Finds the **row** **`article`** for **`messageId`** inside the thread **scroll viewport** (the node with
 * **`data-testid="thread-message-scroll"`**). Use **`ThreadMessageList`**’s internal ref map when you already
 * have **`messageId` → element** from the same render tree; use this when integrating from outside the list
 * or in tests. **`messageId`** values containing **`"`** or **`\\`** are escaped for the attribute selector.
 */
export function queryThreadMessageRowInLog(
  scrollContainer: HTMLElement,
  messageId: string,
): HTMLElement | null {
  const id = messageId.trim();
  if (!id) {
    return null;
  }
  const esc = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return scrollContainer.querySelector(`article[data-message-id="${esc}"]`) as HTMLElement | null;
}
