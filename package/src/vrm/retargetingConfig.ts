import type { BufferSource } from '../hooks/useBuffer'
import { getGltfAnimationClips } from './animation'
import { getVRMCompatibilityReport } from './compatibility'
import {
  createVRMExpressionBindings,
  createVRMExpressionMaterialColorBindings,
  createVRMExpressionOverrideBindings,
  createVRMExpressionTextureTransformBindings,
} from './expressions'
import { loadGltfDocument, loadGltfJson } from './gltf'
import { createVRMHumanoidBindings, getVRMAHumanoidRestPose, getVRMHumanoidRestPose } from './humanoid'
import { createVRMLookAtBoneBindings, createVRMLookAtExpressionBindings } from './lookAt'
import { createVRMNodeConstraintBindings } from './nodeConstraints'
import { createVRMSpringBoneBindings } from './springBone'
import type { VRMAnimationRetargeting, VRMGltfDocument, VRMGltfJson } from './types'

export function createVRMAnimationRetargeting(vrmaDocument: VRMGltfDocument, vrmGltf: VRMGltfJson): VRMAnimationRetargeting {
  const compatibility = getVRMCompatibilityReport(vrmGltf)

  return {
    bindings: createVRMHumanoidBindings(getVRMAHumanoidRestPose(vrmaDocument.json), getVRMHumanoidRestPose(vrmGltf)),
    expressionBindings: createVRMExpressionBindings(vrmaDocument.json, vrmGltf),
    expressionMaterialColorBindings: createVRMExpressionMaterialColorBindings(vrmaDocument.json, vrmGltf),
    expressionTextureTransformBindings: createVRMExpressionTextureTransformBindings(vrmaDocument.json, vrmGltf),
    expressionOverrideBindings: createVRMExpressionOverrideBindings(vrmaDocument.json, vrmGltf),
    lookAtBoneBindings: createVRMLookAtBoneBindings(vrmaDocument.json, vrmGltf),
    lookAtExpressionBindings: createVRMLookAtExpressionBindings(vrmaDocument.json, vrmGltf),
    nodeConstraintBindings: createVRMNodeConstraintBindings(vrmGltf),
    springBoneBindings: createVRMSpringBoneBindings(vrmGltf),
    clips: getGltfAnimationClips(vrmaDocument),
    compatibility,
    targetVersion: compatibility.version,
  }
}

export async function loadVRMAnimationRetargeting(vrmaSource: BufferSource, vrmSource: BufferSource): Promise<VRMAnimationRetargeting> {
  const [vrmaDocument, vrmGltf] = await Promise.all([loadGltfDocument(vrmaSource), loadGltfJson(vrmSource)])
  return createVRMAnimationRetargeting(vrmaDocument, vrmGltf)
}
