export function formatRoomDisplay(room?: string, label = 'Room'): string {
  if (!room || room.trim() === '' || room.toLowerCase() === 'room tbd' || room.toLowerCase() === 'tbd') {
    return `${label} --`;
  }
  // Strip any existing "Room", "room", "அறை" prefix
  const clean = room
    .replace(/^Room\s+/i, '')
    .replace(/^room\s+/i, '')
    .replace(/^அறை\s+/i, '')
    .trim();

  return `${label} ${clean}`;
}

export function formatSlotTime(slot?: string): string {
  if (!slot || slot.trim() === '') return '--';
  try {
    const [hh, mm] = slot.split(':');
    const h = parseInt(hh, 10);
    if (isNaN(h)) return slot;
    const period = h < 12 ? 'AM' : 'PM';
    const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(dh).padStart(2, '0')}:${mm || '00'} ${period}`;
  } catch {
    return slot;
  }
}

