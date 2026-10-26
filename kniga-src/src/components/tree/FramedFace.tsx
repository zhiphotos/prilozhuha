export function FramedFace({ x, y, size, hole, frame, photo, ring }: { x: number; y: number; size: number; hole: number; frame: string; photo: string; ring?: string }) {
  const photoSize = size * hole * 2;
  return (
    <div className="pointer-events-none absolute" style={{ left: x - size, top: y - size, width: size * 2, height: size * 2 }}>
      {photo ? (
        <img src={photo} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover" style={{ width: photoSize, height: photoSize }} />
      ) : (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-800" style={{ width: photoSize, height: photoSize }} />
      )}
      <img src={frame} alt="" className="absolute inset-0 h-full w-full" />
      {ring && <div className="absolute inset-1 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${ring}` }} />}
    </div>
  );
}
