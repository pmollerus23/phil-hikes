import { useEffect, useRef, type RefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';

export default function MapCrosshair({ map, ready, satellite }: {
  map: RefObject<MapRef | null>;
  ready: boolean;
  satellite: boolean;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const coordinates = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ready || !map.current || !overlay.current || !coordinates.current) return;
    const canvas = map.current.getCanvas();
    const element = overlay.current;
    const readout = coordinates.current;
    let frame = 0;
    let x = 0;
    let y = 0;
    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      element.hidden = true;
    };
    const move = (event: PointerEvent) => {
      // Touch has no hovering cursor; never leave a crosshair behind after a tap.
      if (event.pointerType !== 'mouse') {
        hide();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      x = event.clientX - bounds.left;
      y = event.clientY - bounds.top;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        element.style.setProperty('--cursor-x', `${x}px`);
        element.style.setProperty('--cursor-y', `${y}px`);
        const location = map.current!.unproject([x, y]);
        const latitude = `${Math.abs(location.lat).toFixed(3)}° ${location.lat >= 0 ? 'N' : 'S'}`;
        const longitude = `${Math.abs(location.lng).toFixed(3)}° ${location.lng >= 0 ? 'E' : 'W'}`;
        readout.textContent = `${latitude} · ${longitude}`;
        readout.classList.toggle('coordinate-left', x > bounds.width - 170);
        readout.classList.toggle('coordinate-above', y > bounds.height - 70);
        element.hidden = false;
      });
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerenter', move);
    canvas.addEventListener('pointerleave', hide);
    canvas.addEventListener('pointercancel', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', hide);
    document.addEventListener('visibilitychange', hide);
    const resize = new ResizeObserver(hide);
    resize.observe(canvas);
    return () => {
      hide();
      resize.disconnect();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerenter', move);
      canvas.removeEventListener('pointerleave', hide);
      canvas.removeEventListener('pointercancel', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [map, ready]);

  return <div ref={overlay} className={`map-crosshair${satellite ? ' map-crosshair-satellite' : ''}`} hidden aria-hidden="true">
    <span className="crosshair-horizontal" />
    <span className="crosshair-vertical" />
    <span ref={coordinates} className="crosshair-coordinate" />
  </div>;
}
