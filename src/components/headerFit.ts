// When the header runs out of room (a page's tools would scroll, or the page's name shrinks below a readable width),
// it gives up merttoka.com's logo first, then the flask: classes on the bar (LabHeader.css), set again on every
// resize and change of its tools. lab.merttoka.com's src/components/headerFit.ts, kept in step by hand.

export const TIGHT = ['is-tight-1', 'is-tight-2'] as const
/** Below this the page's name is no longer readable (px). */
export const MIN_CRUMB = 72

/** Too little room: the tools strip scrolls, or the crumbs (when there are any) are squeezed. */
export function crowded(bar: HTMLElement): boolean {
  const tools = bar.querySelector<HTMLElement>('.lab-header-tools')
  if (tools && tools.scrollWidth > tools.clientWidth + 1) return true
  const crumbs = bar.querySelector<HTMLElement>('.lab-header-crumbs')
  return !!crumbs && !crumbs.hidden && crumbs.clientWidth < MIN_CRUMB
}

/** The fewest steps that make room (none, then the logo, then the flask too). */
export function fit(bar: HTMLElement, isCrowded = crowded): void {
  bar.classList.remove(...TIGHT)
  for (const step of TIGHT) {
    if (!isCrowded(bar)) return
    bar.classList.add(step)
  }
}

/** Keeps `bar` fitted as it resizes and its tools change; returns the cleanup. */
export function watchFit(bar: HTMLElement): () => void {
  const run = () => fit(bar)
  const size = new ResizeObserver(run)
  size.observe(bar)
  const tools = new MutationObserver(run)
  tools.observe(bar, { childList: true, subtree: true, characterData: true })
  run()
  return () => {
    size.disconnect()
    tools.disconnect()
  }
}
