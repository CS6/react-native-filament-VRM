import type { VRMCompatibilityReport, VRMGltfJson, VRMVersion } from './types'

const SUPPORTED_EXTENSIONS = new Set(['VRM', 'VRMC_vrm', 'VRMC_vrm_animation', 'VRMC_node_constraint', 'VRMC_springBone', 'KHR_materials_unlit'])
const FALLBACK_EXTENSIONS = new Set(['KHR_texture_transform', 'KHR_materials_emissive_strength'])
const UNSUPPORTED_VRM_EXTENSIONS = new Set(['VRMC_materials_mtoon'])

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

function hasTextureTransformExpressionBinds(gltf: VRMGltfJson): boolean {
  const expressions = gltf.extensions?.VRMC_vrm?.expressions
  return Object.values({
    ...(expressions?.preset ?? {}),
    ...(expressions?.custom ?? {}),
  }).some((expression) => (expression?.textureTransformBinds?.length ?? 0) > 0)
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
  if (hasTextureTransformExpressionBinds(gltf)) {
    warnings.push('VRM expression textureTransformBinds require native sampler transform parameter support and are not applied yet.')
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
