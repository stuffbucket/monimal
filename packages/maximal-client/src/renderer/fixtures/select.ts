import { act } from 'react'

/**
 * Chooses an option from a design-system `Select` the way a pointer user does:
 * open the trigger, then press the option whose text is `label`. The design-system
 * select is a listbox popup, not a native `<select>`, so its value cannot be set.
 */
export async function chooseOption(
  trigger: HTMLElement,
  label: string,
  settle: () => Promise<unknown> = () => Promise.resolve(),
): Promise<void> {
  await act(async () => {
    trigger.click()
    await settle()
  })
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((candidate) => candidate.textContent === label)
  if (option === undefined) throw new Error(`the select did not offer "${label}"`)
  await act(async () => {
    option.click()
    await settle()
  })
}

/** The option text a design-system `Select` trigger currently shows. */
export function selectedLabel(trigger: HTMLElement | null): string | undefined {
  return trigger?.textContent ?? undefined
}

/** Whether a design-system `Select` trigger is disabled. */
export function selectDisabled(trigger: HTMLElement): boolean {
  return trigger.hasAttribute('data-disabled')
}
