import type { BufferSource } from '../hooks/useBuffer'
import { getGltfAnimationClips } from './animation'
import { getVRMCompatibilityReport } from './compatibility'
import { loadGltfDocument, loadGltfJson } from './gltf'
import { createVRMHumanoidBindings, getVRMAHumanoidRestPose, getVRMHumanoidRestPose } from './humanoid'
import type { VRMAnimationRetargeting, VRMGltfDocument, VRMGltfJson } from './types'

export function createVRMAnimationRetargeting(vrmaDocument: VRMGltfDocument, vrmGltf: VRMGltfJson): VRMAnimationRetargeting {
  const compatibility = getVRMCompatibilityReport(vrmGltf)

  return {
    bindings: createVRMHumanoidBindings(getVRMAHumanoidRestPose(vrmaDocument.json), getVRMHumanoidRestPose(vrmGltf)),
    clips: getGltfAnimationClips(vrmaDocument),
    compatibility,
    targetVersion: compatibility.version,
  }
}

export async function loadVRMAnimationRetargeting(vrmaSource: BufferSource, vrmSource: BufferSource): Promise<VRMAnimationRetargeting> {
  const [vrmaDocument, vrmGltf] = await Promise.all([loadGltfDocument(vrmaSource), loadGltfJson(vrmSource)])
  return createVRMAnimationRetargeting(vrmaDocument, vrmGltf)
}
