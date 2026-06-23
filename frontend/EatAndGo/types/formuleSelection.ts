/**
 * Logique de sélection d'une formule côté client.
 *
 * Indépendant du thème / de l'API / du panier : pures fonctions + un hook React.
 * La validation reflète `validate_formules` côté serveur (crans requis, min/max),
 * de sorte que « complet » signifie la même chose des deux côtés. Le prix calculé
 * ici est INDICATIF (affichage) : le serveur reste l'autorité (build_formule_components).
 *
 * Emplacement suggéré : types/formuleSelection.ts (ou utils/)
 */
import { useCallback, useMemo, useState } from 'react';

import type { FormuleClient, FormuleClientCourse } from './formule';
// Ajuste le chemin si besoin (order.ts est dans le même dossier types/) :
import type { CreateFormuleInput } from './order';

// courseId (UUID) -> liste des menu_item_id choisis pour ce cran.
// Une liste gère max_choices > 1 ; pour le cas courant (max=1) c'est [id] ou [].
export type FormulePicks = Record<string, number[]>;

export interface CourseStatus {
  courseId: string;
  count: number;
  satisfied: boolean;        // contraintes min/max respectées (et requis rempli)
  error: string | null;      // message si le cran bloque la validation globale
}

export interface FormuleValidation {
  complete: boolean;                       // toute la formule est commandable
  courses: Record<string, CourseStatus>;   // statut par cran
  firstError: string | null;               // 1er message bloquant (pour le footer)
}

// --------------------------------------------------------------------------
// Sélection : toggle en respectant min/max
// --------------------------------------------------------------------------
/**
 * Bascule un plat dans/hors d'un cran.
 * - déjà choisi -> retiré
 * - max_choices === 1 -> remplace le choix précédent (swap)
 * - place disponible -> ajoute
 * - cran plein (max > 1) -> inchangé (l'UI doit désactiver le tap)
 */
export function togglePick(
  picks: FormulePicks,
  course: FormuleClientCourse,
  menuItemId: number,
): FormulePicks {
  const current = picks[course.id] ?? [];
  const isPicked = current.includes(menuItemId);

  let next: number[];
  if (isPicked) {
    next = current.filter((id) => id !== menuItemId);
  } else if (course.max_choices === 1) {
    next = [menuItemId];
  } else if (current.length < course.max_choices) {
    next = [...current, menuItemId];
  } else {
    return picks; // plein : ignorer
  }

  return { ...picks, [course.id]: next };
}

export function isPicked(
  picks: FormulePicks,
  courseId: string,
  menuItemId: number,
): boolean {
  return (picks[courseId] ?? []).includes(menuItemId);
}

// --------------------------------------------------------------------------
// Validation (miroir de validate_formules)
// --------------------------------------------------------------------------
export function validateFormuleSelection(
  formule: FormuleClient,
  picks: FormulePicks,
): FormuleValidation {
  const courses: Record<string, CourseStatus> = {};
  let firstError: string | null = null;

  for (const course of formule.courses) {
    const count = (picks[course.id] ?? []).length;
    let error: string | null = null;

    if (course.is_required && count < course.min_choices) {
      error =
        course.min_choices > 1
          ? `« ${course.name} » : ${course.min_choices} choix requis`
          : `« ${course.name} » : choix requis`;
    } else if (count > course.max_choices) {
      error = `« ${course.name} » : ${course.max_choices} choix maximum`;
    }

    const satisfied = error === null;
    courses[course.id] = { courseId: course.id, count, satisfied, error };
    if (error && !firstError) firstError = error;
  }

  return { complete: firstError === null, courses, firstError };
}

// --------------------------------------------------------------------------
// Prix indicatif : base de la formule + suppléments des plats choisis
// --------------------------------------------------------------------------
export function computeFormulePrice(
  formule: FormuleClient,
  picks: FormulePicks,
): number {
  let total = parseFloat(formule.price) || 0;

  for (const course of formule.courses) {
    const chosen = picks[course.id] ?? [];
    for (const item of course.items) {
      if (chosen.includes(item.menu_item_id)) {
        total += parseFloat(item.extra_price) || 0;
      }
    }
  }
  return total;
}

// --------------------------------------------------------------------------
// Construction du payload (CreateFormuleInput) consommé par OrderCreateSerializer
// --------------------------------------------------------------------------
export function buildFormuleInput(
  formule: FormuleClient,
  picks: FormulePicks,
  quantity = 1,
): CreateFormuleInput {
  const selections: CreateFormuleInput['selections'] = [];

  for (const course of formule.courses) {
    for (const menuItemId of picks[course.id] ?? []) {
      selections.push({ course: course.id, menu_item: menuItemId });
    }
  }

  return { formule: formule.id, quantity, selections };
}

// --------------------------------------------------------------------------
// Hook prêt à l'emploi pour l'écran configurateur
// --------------------------------------------------------------------------
export interface UseFormuleSelection {
  picks: FormulePicks;
  quantity: number;
  setQuantity: (q: number) => void;
  toggle: (course: FormuleClientCourse, menuItemId: number) => void;
  isItemPicked: (courseId: string, menuItemId: number) => boolean;
  validation: FormuleValidation;
  price: number;            // prix indicatif d'UNE formule (base + suppléments)
  totalPrice: number;       // price * quantity
  /** Payload prêt à ajouter au panier, ou null tant que la formule est incomplète. */
  payload: CreateFormuleInput | null;
  reset: () => void;
}

export function useFormuleSelection(formule: FormuleClient): UseFormuleSelection {
  const [picks, setPicks] = useState<FormulePicks>({});
  const [quantity, setQuantity] = useState(1);

  const toggle = useCallback(
    (course: FormuleClientCourse, menuItemId: number) => {
      setPicks((prev) => togglePick(prev, course, menuItemId));
    },
    [],
  );

  const isItemPicked = useCallback(
    (courseId: string, menuItemId: number) => isPicked(picks, courseId, menuItemId),
    [picks],
  );

  const validation = useMemo(
    () => validateFormuleSelection(formule, picks),
    [formule, picks],
  );

  const price = useMemo(
    () => computeFormulePrice(formule, picks),
    [formule, picks],
  );

  const payload = useMemo(
    () => (validation.complete ? buildFormuleInput(formule, picks, quantity) : null),
    [validation.complete, formule, picks, quantity],
  );

  const reset = useCallback(() => {
    setPicks({});
    setQuantity(1);
  }, []);

  return {
    picks,
    quantity,
    setQuantity,
    toggle,
    isItemPicked,
    validation,
    price,
    totalPrice: price * quantity,
    payload,
    reset,
  };
}