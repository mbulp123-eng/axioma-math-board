// One pointer edits; two fingers navigate. A navigation gesture never commits an edit.
export function createPointerInput(target, hooks) {
  const touches = new Map(); let editing = null, navigation = null, suppressTouches = false, lastPen = -Infinity;
  const point = e => hooks.point(e);
  const kind = e => e.pointerType || 'mouse';
  function capture(e) { try { target.setPointerCapture(e.pointerId); } catch {} }
  function cancelEdit() { if (editing !== null) { editing = null; hooks.end(true); } }
  function navigationEnd() { if (navigation) { navigation = null; hooks.navigationEnd(); } }
  function beginNavigation() {
    cancelEdit(); const [a, b] = [...touches.values()];
    if (!a || !b) return;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view = hooks.view();
    navigation = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: view.scale,
      world: { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale } };
  }
  function down(e) {
    const type = kind(e);
    if (type !== 'touch' && ![0, 1, 2].includes(e.button)) return;
    e.preventDefault();
    if (type === 'touch') {
      if (editing?.type === 'pen' || Date.now() - lastPen < 250) { suppressTouches = true; touches.set(e.pointerId, point(e)); capture(e); return; }
      touches.set(e.pointerId, point(e)); capture(e);
      if (suppressTouches) return;
      if (touches.size >= 2) { if (!navigation) beginNavigation(); return; }
      if (editing) return;
    } else if (type === 'pen') {
      lastPen = Date.now(); cancelEdit(); navigationEnd(); suppressTouches = touches.size > 0;
    } else if (editing || touches.size) return;
    capture(e); editing = { id: e.pointerId, type }; hooks.start(e);
  }
  function move(e) {
    const type = kind(e);
    if (type === 'pen') lastPen = Date.now();
    if (type === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, point(e));
      if (navigation && !suppressTouches) {
        e.preventDefault(); const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = Math.max(.08, Math.min(6, navigation.scale * Math.hypot(a.x - b.x, a.y - b.y) / navigation.distance));
        hooks.navigate({ scale, x: mid.x - navigation.world.x * scale, y: mid.y - navigation.world.y * scale }); return;
      }
      if (suppressTouches) return;
    }
    if (editing?.id === e.pointerId) hooks.move(e);
    else if (!editing && !touches.size && type === 'mouse') hooks.hover?.(e);
  }
  function finish(e, canceled = false) {
    const type = kind(e), wasTouch = touches.delete(e.pointerId);
    if (type === 'pen') lastPen = Date.now();
    if (wasTouch && navigation) { navigationEnd(); suppressTouches = touches.size > 0; }
    if (editing?.id === e.pointerId) { editing = null; hooks.end(canceled); }
    if (!touches.size) suppressTouches = false;
    try { if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId); } catch {}
  }
  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', e => finish(e));
  target.addEventListener('pointercancel', e => finish(e, true));
  target.addEventListener('lostpointercapture', e => finish(e, true));
  return {
    cancel() { cancelEdit(); navigationEnd(); touches.clear(); suppressTouches = false; },
    isNavigating: () => !!navigation,
    // Exposed solely for DOM-independent tests, not global browser state.
    handlers: { down, move, finish }
  };
}
