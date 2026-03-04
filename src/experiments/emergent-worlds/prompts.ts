/** Default prompt for FLUX generation from DLA simulation frames. */
export const DEFAULT_PROMPT = 'A bioluminescent crystalline ecosystem with dense fractal dendritic branches resembling neural pathways and river deltas. Cool blue-white luminescence pulses through interconnected nodes. Thousands of glowing nodes pulse with soft amber and cyan light across the organic network. Scanning electron microscope aesthetic with false-color enhancement in ice blue and warm amber, extreme depth of field.'

/** Auto-appended suffix that enforces structural fidelity to the sim frame. */
export function buildStructureSuffix(hasRefImage: boolean): string {
  const base = ' Match the spatial distribution of detail from image 1 exactly. Areas with bright structure get rich detail and texture. Areas that are dark or empty remain as flat, untextured, uniform surfaces with no added detail.'
  const ref = hasRefImage
    ? ' Maintain the rendering style and color palette from image 2.'
    : ''
  return base + ref
}

/** Tooltip text explaining the auto-appended structure suffix. */
export const STRUCTURE_SUFFIX_TIP = 'A prompt suffix is auto-appended to enforce structural fidelity: detail follows the sim frame\'s bright regions, empty regions stay flat and untextured. When a previous AI frame exists, it\'s passed as a style reference for temporal coherence.'
