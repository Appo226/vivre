/**
 * lib/mp4-duration.ts — Lit la durée d'un fichier MP4 côté serveur, sans ffmpeg.
 *
 * La vérification client (readVideoDuration dans publicite/creer/page.tsx) est une
 * commodité UX — un utilisateur qui appelle l'API d'upload directement peut la contourner.
 * Celle-ci est la vraie barrière : la durée vient de l'atome mvhd du conteneur MP4 lui-même
 * (timescale + duration, 32 bits), pas d'un décodage vidéo — aucune dépendance native,
 * fonctionne dans une fonction serverless comme n'importe quel autre code.
 *
 * Ne couvre que video/mp4 — c'est le seul format vidéo accepté pour cette raison précise :
 * WebM (EBML/Matroska) demanderait un parseur différent, et on préfère UNE limite qui
 * s'applique vraiment à tout ce qu'on accepte plutôt que deux formats avec des garanties
 * différentes.
 */

function readBoxHeader(view: DataView, offset: number): { size: number; type: string; headerSize: number } | null {
  if (offset + 8 > view.byteLength) return null;
  const size32 = view.getUint32(offset);
  const type = String.fromCharCode(
    view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7)
  );
  if (size32 === 1) {
    // Taille 64 bits — rare pour un mvhd/moov mais géré pour ne pas planter dessus.
    if (offset + 16 > view.byteLength) return null;
    const hi = view.getUint32(offset + 8);
    const lo = view.getUint32(offset + 12);
    return { size: hi * 2 ** 32 + lo, type, headerSize: 16 };
  }
  return { size: size32, type, headerSize: 8 };
}

/** Cherche récursivement `moov > mvhd` et retourne la durée en secondes, ou null si absente/illisible. */
export function getMp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  function findMvhd(start: number, end: number, insideMoov: boolean): number | null {
    let offset = start;
    while (offset < end) {
      const box = readBoxHeader(view, offset);
      if (!box || box.size < box.headerSize) return null;
      if (box.type === "moov") {
        const result = findMvhd(offset + box.headerSize, offset + box.size, true);
        if (result !== null) return result;
      } else if (insideMoov && box.type === "mvhd") {
        const bodyStart = offset + box.headerSize;
        const version = view.getUint8(bodyStart);
        if (version === 0) {
          const timescale = view.getUint32(bodyStart + 12);
          const duration = view.getUint32(bodyStart + 16);
          return timescale > 0 ? duration / timescale : null;
        }
        if (version === 1) {
          const timescale = view.getUint32(bodyStart + 20);
          const hi = view.getUint32(bodyStart + 24);
          const lo = view.getUint32(bodyStart + 28);
          const duration = hi * 2 ** 32 + lo;
          return timescale > 0 ? duration / timescale : null;
        }
        return null;
      }
      offset += box.size;
    }
    return null;
  }

  try {
    return findMvhd(0, bytes.byteLength, false);
  } catch {
    return null;
  }
}
