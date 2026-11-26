import { createContext, type ReactNode } from 'react'

/**
 * Élément ajouté par le shell à l'en-tête de chaque page de section (bouton « Tutoriel », lot T),
 * sans que chaque page ait à le déclarer.
 */
export const PageHeadingExtrasContext = createContext<ReactNode>(null)
