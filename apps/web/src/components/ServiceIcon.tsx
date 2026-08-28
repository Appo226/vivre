/**
 * components/ServiceIcon.tsx — Résout un nom d'icône Lucide (stocké en base, ex: "Ambulance")
 * vers le vrai composant. Utilisé partout où EmergencyNumber.icon / PublicServiceCategory.icon
 * est affiché — ces champs sont des noms d'export lucide-react, pas de l'emoji à afficher tel
 * quel (contrairement à EventCategory.icon, qui lui est bien de l'emoji littéral).
 *
 * Import nommé explicite de CHAQUE icône utilisée (pas `import * as LucideIcons`) — lucide-react
 * ne tree-shake pas un accès dynamique `LucideIcons[name]`, ce qui embarquait les ~1500 icônes
 * de la librairie entière (+170 Ko JS) rien que pour en afficher 9. Recensées en base via
 * EmergencyNumber.icon / PublicServiceCategory.icon (is_active) — si une future entrée en base
 * utilise un nom absent d'ici, elle retombe sur AlertCircle : ajouter son import ci-dessous.
 */

import {
  AlertCircle,
  Ambulance,
  Badge,
  Church,
  Flame,
  Fuel,
  Hospital,
  MoonStar,
  Pill,
  Shield,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  Ambulance,
  Badge,
  Church,
  Flame,
  Fuel,
  Hospital,
  MoonStar,
  Pill,
  Shield,
};

export function ServiceIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }): React.ReactElement {
  const Icon = ICONS[name] ?? AlertCircle;
  return <Icon className={className} style={style} />;
}
