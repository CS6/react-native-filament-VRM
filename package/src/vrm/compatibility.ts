import type { VRMCompatibilityReport, VRMGltfJson, VRMVersion } from './types'

const SUPPORTED_EXTENSIONS = new Set(['VRM', 'VRMC_vrm', 'VRMC_vrm_animation', 'VRMC_node_constraint', 'KHR_materials_unlit'])
const FALLBACK_EXTENSIONS = new Set(['KHR_texture_transform', 'KHR_materials_emissive_strength'])
const UNSUPPORTED_VRM_EXTENSIONS = new Set(['VRMC_materials_mtoon', 'VRMC_springBone'])

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value != null))).sort()
}

function getVRMVersion(gltf: VRMGltfJson): VRMVersion {
  if (gltf.extensions?.VRMC_vrm != null) return '1.0'
  if (gltf.extensions?.VRM != null) return '0.x'
  return 'unknown'
}

function getHumanoidBoneCount(gltf: VRMGltfJson): number {
  const vrm0Bones = gltf.extensions?.VRM?.humanoid?.humanBones
  if (vrm0Bones != null) return vrm0Bones.filter((bone) => bone.node != null).length

  const vrm1Bones = gltf.extensions?.VRMC_vrm?.humanoid?.humanBones ?? gltf.extensions?.VRMC_vrm_animation?.humanoid?.humanBones
  if (vrm1Bones != null) {
    return Object.values(vrm1Bones).filter((bone) => bone?.node != null).length
  }

  return 0
}

function getUnsupportedNodeConstraintTypes(gltf: VRMGltfJson): string[] {
  const unsupportedTypes: string[] = []

  for (const node of gltf.nodes ?? []) {
    const constraint = node.extensions?.VRMC_node_constraint?.constraint
    if (constraint == null) continue

    if ('roll' in constraint) unsupportedTypes.push('roll')
    if ('aim' in constraint) unsupportedTypes.push('aim')
  }

  return unique(unsupportedTypes)
}

export function getVRMCompatibilityReport(gltf: VRMGltfJson): VRMCompatibilityReport {
  const extensionsUsed = unique(gltf.extensionsUsed ?? [])
  const materialExtensions = unique((gltf.materials ?? []).flatMap((material) => Object.keys(material.extensions ?? {})))
  const alphaModes = unique((gltf.materials ?? []).map((material) => material.alphaMode ?? 'OPAQUE'))
  const allExtensions = unique([...extensionsUsed, ...materialExtensions])
  const supportedExtensions = allExtensions.filter((extension) => SUPPORTED_EXTENSIONS.has(extension))
  const fallbackExtensions = allExtensions.filter((extension) => FALLBACK_EXTENSIONS.has(extension))
  const unsupportedExtensions = allExtensions.filter(
    (extension) => UNSUPPORTED_VRM_EXTENSIONS.has(extension) || (!SUPPORTED_EXTENSIONS.has(extension) && !FALLBACK_EXTENSIONS.has(extension))
  )
  const warnings: string[] = []
  const version = getVRMVersion(gltf)

  if (version === '1.0' && materialExtensions.includes('VRMC_materials_mtoon')) {
    warnings.push('VRM 1.0 MToon materials need an explicit fallback or custom material path.')
  }
  const unsupportedNodeConstraintTypes = getUnsupportedNodeConstraintTypes(gltf)
  if (unsupportedNodeConstraintTypes.length > 0) {
    warnings.push(`VRMC_node_constraint ${unsupportedNodeConstraintTypes.join('/')} constraints are not applied yet.`)
  }
  if (extensionsUsed.includes('VRMC_springBone')) {
    warnings.push('VRMC_springBone is not simulated yet; hair, cloth, and accessory secondary motion will be static.')
  }

  return {
    version,
    humanoidBoneCount: getHumanoidBoneCount(gltf),
    extensionsUsed,
    materialExtensions,
    alphaModes,
    supportedExtensions,
    unsupportedExtensions,
    fallbackExtensions,
    warnings,
  }
}
