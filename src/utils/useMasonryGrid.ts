import { useLayoutEffect, useRef } from "react";

export const getMasonryRowSpan = (
  itemHeight: number,
  rowHeight: number,
  rowGap: number,
) => Math.max(1, Math.ceil((itemHeight + rowGap) / (rowHeight + rowGap)));

const readPixels = (value: string) => {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
};

export const useMasonryGrid = <T extends HTMLElement>(dependency: unknown) => {
  const gridRef = useRef<T>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    grid.dataset.masonry = "true";
    let animationFrame = 0;
    const layout = () => {
      const gridStyle = window.getComputedStyle(grid);
      const rowHeight = readPixels(gridStyle.gridAutoRows);
      const rowGap = readPixels(gridStyle.rowGap);

      if (rowHeight <= 0) return;

      Array.from(grid.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        const itemStyle = window.getComputedStyle(child);
        const itemHeight =
          child.getBoundingClientRect().height +
          readPixels(itemStyle.marginBottom);
        const span = getMasonryRowSpan(itemHeight, rowHeight, rowGap);
        child.style.gridRowEnd = `span ${span}`;
      });
    };
    const scheduleLayout = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(layout);
    };

    layout();
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(grid);
    Array.from(grid.children).forEach((child) => observer.observe(child));

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      delete grid.dataset.masonry;
      Array.from(grid.children).forEach((child) => {
        if (child instanceof HTMLElement) child.style.gridRowEnd = "";
      });
    };
  }, [dependency]);

  return gridRef;
};
