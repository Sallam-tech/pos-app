import { expect, type Page } from "@playwright/test";

// Independent WCAG luminance calculation against actual rendered colors.
// Decorative dividers and disabled controls are not treated as input boundaries.
export async function expectReadableContrast(page: Page) {
  const result = await page.evaluate(() => {
    type RGB = [number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    function rgba(css: string): [number, number, number, number] {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css; context.fillRect(0, 0, 1, 1);
      const value = context.getImageData(0, 0, 1, 1).data;
      return [value[0], value[1], value[2], value[3] / 255];
    }
    function over(front: [number, number, number, number], back: RGB): RGB {
      return [0, 1, 2].map((i) => front[i] * front[3] + back[i] * (1 - front[3])) as RGB;
    }
    function background(element: Element | null): RGB {
      const parents: Element[] = [];
      for (let node = element; node; node = node.parentElement) parents.unshift(node);
      return parents.reduce<RGB>((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
    }
    function luminance(rgb: RGB) {
      const linear = rgb.map((value) => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    }
    function ratio(front: RGB, back: RGB) {
      const a = luminance(front), b = luminance(back);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }
    const failures: { text: string; ratio: number; required: number }[] = [];
    const pairs = new Set<string>();
    function check(element: Element, text: string, color: string, required: number) {
      const bg = background(element);
      const fg = over(rgba(color), bg);
      const key = fg.join(",") + "/" + bg.join(",") + "/" + required;
      if (pairs.has(key)) return;
      pairs.add(key);
      const actual = ratio(fg, bg);
      if (actual + .001 < required) failures.push({ text, ratio: actual, required });
    }
    function visible(element: Element) {
      return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest(":disabled,[aria-disabled=true]");
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const element = walker.currentNode.parentElement;
      const text = walker.currentNode.textContent?.trim();
      if (!element || !text || !visible(element) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) continue;
      const style = getComputedStyle(element);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      check(element, text.slice(0, 70), style.color, large ? 3 : 4.5);
    }
    document.querySelectorAll("input,select,textarea").forEach((element) => {
      if (!visible(element)) return;
      check(element, element.getAttribute("aria-label") ?? element.tagName, getComputedStyle(element).color, 4.5);
      if (element.hasAttribute("placeholder")) check(element, "placeholder", getComputedStyle(element, "::placeholder").color, 4.5);
    });
    document.querySelectorAll("input,select,textarea,button").forEach((element) => {
      if (!visible(element)) return;
      const style = getComputedStyle(element);
      if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none") {
        const bg = background(element.parentElement);
        const actual = ratio(over(rgba(style.borderTopColor), bg), bg);
        if (actual + .001 < 3) failures.push({ text: element.tagName + " control border", ratio: actual, required: 3 });
      }
    });
    return { checkedPairs: pairs.size, failures };
  });
  expect(result.checkedPairs).toBeGreaterThan(2);
  expect(result.failures, JSON.stringify(result.failures, null, 2)).toEqual([]);
  return result.checkedPairs;
}
