export type { Meta, StoryObj } from '@storybook/react-vite';

export function storybookManagerHead(
  head: string | undefined,
  identity: string | undefined,
): string {
  const existingHead = head ?? '';
  const normalizedIdentity = identity?.trim();
  if (!normalizedIdentity) return existingHead;
  const encodedIdentity = JSON.stringify(normalizedIdentity).replaceAll('<', '\\u003c');
  return `${existingHead}
<script>
  (() => {
    const identity = ${encodedIdentity};
    const title = \`Storybook · \${identity}\`;
    const applyIdentity = () => {
      if (document.title !== title) document.title = title;
      if (document.querySelector('[data-monimal-storybook-identity]')) return;
      const badge = document.createElement('div');
      badge.dataset.monimalStorybookIdentity = '';
      badge.textContent = identity;
      badge.style.cssText = 'position:fixed;right:12px;bottom:8px;z-index:2147483647;padding:4px 8px;border-radius:4px;background:#15171c;color:#fff;font:12px/1.4 ui-monospace,monospace;box-shadow:0 1px 4px #0008;pointer-events:none';
      document.body.append(badge);
    };
    addEventListener('DOMContentLoaded', applyIdentity);
    new MutationObserver(applyIdentity).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  })();
</script>`;
}
