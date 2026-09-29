import type { BrowserSnapshot } from '../contract.js';

const REF_ATTRIBUTE = 'data-maximal-browser-ref';
const REF_PATTERN = /^e\d+$/;

function assertElementRef(ref: string): void {
  if (!REF_PATTERN.test(ref)) throw new Error(`Invalid browser element reference: ${ref}`);
}

export const snapshotScript = `(() => {
  const attribute = ${JSON.stringify(REF_ATTRIBUTE)};
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none'
      && rect.width > 0 && rect.height > 0;
  };
  const role = (element) => element.getAttribute('role') || ({
    A: 'link', BUTTON: 'button', INPUT: element.type || 'textbox',
    SELECT: 'combobox', TEXTAREA: 'textbox'
  }[element.tagName] || element.tagName.toLowerCase());
  const name = (element) => (
    element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.getAttribute('alt')
    || element.getAttribute('placeholder')
    || element.innerText
    || element.value
    || ''
  ).trim().replace(/\\s+/g, ' ').slice(0, 240);
  document.querySelectorAll('[' + attribute + ']').forEach((element) =>
    element.removeAttribute(attribute));
  const elements = [];
  const candidates = document.querySelectorAll(
    'a[href],button,input,textarea,select,[role],[contenteditable="true"],[tabindex]'
  );
  for (const element of candidates) {
    if (!visible(element)) continue;
    const ref = 'e' + String(elements.length + 1);
    element.setAttribute(attribute, ref);
    const value = 'value' in element && typeof element.value === 'string'
      ? element.value.slice(0, 500)
      : undefined;
    elements.push({
      ref,
      role: role(element),
      name: name(element),
      ...(value ? { value } : {}),
      ...('checked' in element && typeof element.checked === 'boolean'
        ? { checked: element.checked }
        : {}),
      disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true'
    });
  }
  return {
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').trim().slice(0, 20000),
    elements: elements.slice(0, 500)
  };
})()`;

export function elementActionScript(
  ref: string,
  action: 'click' | 'hover',
): string {
  assertElementRef(ref);
  return `(() => {
    const element = document.querySelector(
      '[${REF_ATTRIBUTE}="${ref}"]'
    );
    if (!(element instanceof HTMLElement)) {
      throw new Error('Browser element ${ref} is stale; inspect the page again.');
    }
    if (element.matches(':disabled,[aria-disabled="true"]')) {
      throw new Error('Browser element ${ref} is disabled.');
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    ${action === 'click'
      ? `element.focus(); element.click();`
      : `element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
         element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));`}
    return true;
  })()`;
}

export function typeScript(ref: string, text: string, clear: boolean): string {
  assertElementRef(ref);
  return `(() => {
    const element = document.querySelector(
      '[${REF_ATTRIBUTE}="${ref}"]'
    );
    if (!(element instanceof HTMLElement)) {
      throw new Error('Browser element ${ref} is stale; inspect the page again.');
    }
    if (element.matches(':disabled,[aria-disabled="true"]')) {
      throw new Error('Browser element ${ref} is disabled.');
    }
    const text = ${JSON.stringify(text)};
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.focus();
    if (element instanceof HTMLSelectElement) {
      const option = [...element.options].find((candidate) =>
        candidate.value === text || candidate.text.trim() === text);
      if (!option) throw new Error('No browser option matches: ' + text);
      element.value = option.value;
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) throw new Error('This browser field cannot be edited.');
      setter.call(element, ${clear ? "''" : 'element.value'} + text);
    } else if (element.isContentEditable) {
      element.textContent = ${clear ? "''" : 'element.textContent || ""'} + text;
    } else {
      throw new Error('Browser element ${ref} is not editable.');
    }
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: text
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

export function dragScript(fromRef: string, toRef: string): string {
  assertElementRef(fromRef);
  assertElementRef(toRef);
  return `(() => {
    const source = document.querySelector('[${REF_ATTRIBUTE}="${fromRef}"]');
    const target = document.querySelector('[${REF_ATTRIBUTE}="${toRef}"]');
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error('A browser drag reference is stale; inspect the page again.');
    }
    source.scrollIntoView({ block: 'center', inline: 'center' });
    target.scrollIntoView({ block: 'center', inline: 'center' });
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer
    }));
    target.dispatchEvent(new DragEvent('dragenter', {
      bubbles: true, cancelable: true, dataTransfer
    }));
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer
    }));
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer
    }));
    source.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer
    }));
    return true;
  })()`;
}

export function textPresentScript(text: string): string {
  return `Boolean(document.body?.innerText.includes(${JSON.stringify(text)}))`;
}

export function scrollScript(direction: 'up' | 'down' | 'left' | 'right', amount: number): string {
  const distance = Math.min(Math.max(Math.round(amount), 1), 5_000);
  const delta = {
    up: [0, -distance],
    down: [0, distance],
    left: [-distance, 0],
    right: [distance, 0],
  }[direction];
  return `(() => {
    window.scrollBy({ left: ${delta[0]}, top: ${delta[1]}, behavior: 'instant' });
    return { x: window.scrollX, y: window.scrollY };
  })()`;
}

export function parseSnapshot(value: unknown): BrowserSnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The browser page returned an invalid snapshot.');
  }
  const snapshot = value as Partial<BrowserSnapshot>;
  if (
    typeof snapshot.url !== 'string'
    || typeof snapshot.title !== 'string'
    || typeof snapshot.text !== 'string'
    || !Array.isArray(snapshot.elements)
  ) {
    throw new Error('The browser page returned an invalid snapshot.');
  }
  return snapshot as BrowserSnapshot;
}
