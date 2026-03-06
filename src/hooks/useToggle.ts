
import { useState } from 'react';

export function useToggle(initial = false) {
  const [open, setOpen] = useState(initial);
  const toggle = () => setOpen(o => !o);
  return { open, toggle };
}
