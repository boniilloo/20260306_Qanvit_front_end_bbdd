import { useEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Coordina el colapso del sidebar principal entre páginas que quieren más espacio
 * (Specs, Candidates, Workflow, PublicSpecs). El truco es compartir estado a nivel
 * módulo para evitar la carrera Unmount-de-A → Mount-de-B:
 *
 *  1. Cuando A se desmonta, programa un "restore" diferido con setTimeout(0)
 *     en lugar de restaurar inmediatamente.
 *  2. Cuando B se monta acto seguido, **cancela** ese restore pendiente.
 *  3. Si nadie lo cancela, el restore se ejecuta en el siguiente tick y devuelve
 *     el sidebar a la preferencia original del usuario (antes de que cualquiera
 *     de las páginas auto-colapso lo tocara).
 *
 * Resultado: navegar entre dos páginas auto-colapso mantiene el sidebar colapsado,
 * y al abandonar el "área de colapso" se restaura al estado previo que tenía el usuario.
 */

let collapseOwners = 0;
// null => no hay ningún dueño activo; se re-lee cuando entra el primero.
let userPrefOpen: boolean | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

export function useCollapseSidebarOnRoute(): void {
  const { setOpen, state } = useSidebar();

  // Refs para leer setOpen/state frescos sin añadirlos a deps del effect de mount.
  const setOpenRef = useRef(setOpen);
  const stateRef = useRef(state);
  setOpenRef.current = setOpen;
  stateRef.current = state;

  useEffect(() => {
    // Si un "hermano" dejó un restore programado, cancelarlo: nos encadenamos.
    if (restoreTimer) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
    // Solo el primer dueño activo congela la preferencia del usuario; los que se
    // encadenan después reutilizan la misma para no perderla tras un auto-colapso.
    if (userPrefOpen === null) {
      userPrefOpen = stateRef.current === 'expanded';
    }
    collapseOwners += 1;
    if (userPrefOpen) setOpenRef.current(false);

    return () => {
      collapseOwners -= 1;
      if (collapseOwners === 0 && userPrefOpen === true) {
        // Restore diferido: si otra página auto-colapso está a punto de montarse,
        // cancelará este timer antes de que corra.
        restoreTimer = setTimeout(() => {
          restoreTimer = null;
          if (collapseOwners === 0) {
            setOpenRef.current(true);
            userPrefOpen = null;
          }
        }, 0);
      } else if (collapseOwners === 0) {
        // Salimos sin restore (el usuario ya tenía colapsado): limpiamos.
        userPrefOpen = null;
      }
    };
  }, []);
}
