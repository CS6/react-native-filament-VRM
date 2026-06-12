import type { Float4 } from '../types'
import { multiplyQuat, normalizeQuat } from './retargeting'
import type {
  VRMAnimationSourceReport,
  VRMGltfJson,
  VRMHumanoidBinding,
  VRMHumanoidBoneName,
  VRMHumanoidNodeNames,
  VRMHumanoidRestNode,
  VRMHumanoidRestPose,
} from './types'

export const VRM_HUMANOID_BONES: VRMHumanoidBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftEye',
  'rightEye',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbIntermediate',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbIntermediate',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
]

const VRM_HUMANOID_PARENT: Partial<Record<VRMHumanoidBoneName, VRMHumanoidBoneName>> = {
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftEye: 'head',
  rightEye: 'head',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
  leftThumbMetacarpal: 'leftHand',
  leftThumbProximal: 'leftThumbMetacarpal',
  leftThumbIntermediate: 'leftThumbProximal',
  leftThumbDistal: 'leftThumbIntermediate',
  leftIndexProximal: 'leftHand',
  leftIndexIntermediate: 'leftIndexProximal',
  leftIndexDistal: 'leftIndexIntermediate',
  leftMiddleProximal: 'leftHand',
  leftMiddleIntermediate: 'leftMiddleProximal',
  leftMiddleDistal: 'leftMiddleIntermediate',
  leftRingProximal: 'leftHand',
  leftRingIntermediate: 'leftRingProximal',
  leftRingDistal: 'leftRingIntermediate',
  leftLittleProximal: 'leftHand',
  leftLittleIntermediate: 'leftLittleProximal',
  leftLittleDistal: 'leftLittleIntermediate',
  rightThumbMetacarpal: 'rightHand',
  rightThumbProximal: 'rightThumbMetacarpal',
  rightThumbIntermediate: 'rightThumbProximal',
  rightThumbDistal: 'rightThumbIntermediate',
  rightIndexProximal: 'rightHand',
  rightIndexIntermediate: 'rightIndexProximal',
  rightIndexDistal: 'rightIndexIntermediate',
  rightMiddleProximal: 'rightHand',
  rightMiddleIntermediate: 'rightMiddleProximal',
  rightMiddleDistal: 'rightMiddleIntermediate',
  rightRingProximal: 'rightHand',
  rightRingIntermediate: 'rightRingProximal',
  rightRingDistal: 'rightRingIntermediate',
  rightLittleProximal: 'rightHand',
  rightLittleIntermediate: 'rightLittleProximal',
  rightLittleDistal: 'rightLittleIntermediate',
}

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

function getNodeRotation(gltf: VRMGltfJson, nodeIndex: number): Float4 {
  return normalizeQuat(gltf.nodes?.[nodeIndex]?.rotation ?? [0, 0, 0, 1])
}

function getRootNodeIndices(gltf: VRMGltfJson): number[] {
  const scene = gltf.scenes?.[gltf.scene ?? 0]
  if (scene?.nodes != null) return scene.nodes

  const childNodeIndices = new Set<number>()
  for (const node of gltf.nodes ?? []) {
    for (const child of node.children ?? []) {
      childNodeIndices.add(child)
    }
  }

  return (gltf.nodes ?? []).flatMap((_, index) => (childNodeIndices.has(index) ? [] : [index]))
}

function getWorldRotations(gltf: VRMGltfJson): Map<number, Float4> {
  const worldRotations = new Map<number, Float4>()

  function visit(nodeIndex: number, parentWorldRotation: Float4) {
    const localRotation = getNodeRotation(gltf, nodeIndex)
    const worldRotation = multiplyQuat(parentWorldRotation, localRotation)
    worldRotations.set(nodeIndex, worldRotation)

    for (const child of gltf.nodes?.[nodeIndex]?.children ?? []) {
      visit(child, worldRotation)
    }
  }

  for (const rootNodeIndex of getRootNodeIndices(gltf)) {
    visit(rootNodeIndex, [0, 0, 0, 1])
  }

  return worldRotations
}

function createRestNode(gltf: VRMGltfJson, nodeIndex: number | undefined, worldRotations: Map<number, Float4>): VRMHumanoidRestNode | undefined {
  if (nodeIndex == null) return undefined

  const name = getNodeName(gltf, nodeIndex)
  if (name == null) return undefined

  return {
    name,
    localRotation: getNodeRotation(gltf, nodeIndex),
    worldRotation: worldRotations.get(nodeIndex) ?? [0, 0, 0, 1],
  }
}

export function getVRMHumanoidRestPose(gltf: VRMGltfJson): VRMHumanoidRestPose {
  const worldRotations = getWorldRotations(gltf)
  const vrm0Bones = gltf.extensions?.VRM?.humanoid?.humanBones
  if (vrm0Bones != null) {
    const restPose: VRMHumanoidRestPose = {}
    for (const humanBone of vrm0Bones) {
      const bone = humanBone.bone as VRMHumanoidBoneName | undefined
      if (bone == null) continue

      const restNode = createRestNode(gltf, humanBone.node, worldRotations)
      if (restNode != null) {
        restPose[bone] = restNode
      }
    }
    return restPose
  }

  const vrm1Bones = gltf.extensions?.VRMC_vrm?.humanoid?.humanBones
  if (vrm1Bones != null) {
    const restPose: VRMHumanoidRestPose = {}
    for (const bone of VRM_HUMANOID_BONES) {
      const restNode = createRestNode(gltf, vrm1Bones[bone]?.node, worldRotations)
      if (restNode != null) {
        restPose[bone] = restNode
      }
    }
    return restPose
  }

  return {}
}

export function getVRMAHumanoidRestPose(gltf: VRMGltfJson): VRMHumanoidRestPose {
  const worldRotations = getWorldRotations(gltf)
  const humanBones = gltf.extensions?.VRMC_vrm_animation?.humanoid?.humanBones
  if (humanBones == null) return {}

  const restPose: VRMHumanoidRestPose = {}
  for (const bone of VRM_HUMANOID_BONES) {
    const restNode = createRestNode(gltf, humanBones[bone]?.node, worldRotations)
    if (restNode != null) {
      restPose[bone] = restNode
    }
  }
  return restPose
}

export function getVRMAnimationSourceHumanoidRestPose(gltf: VRMGltfJson): VRMHumanoidRestPose {
  const vrmaRestPose = getVRMAHumanoidRestPose(gltf)
  if (Object.keys(vrmaRestPose).length > 0) return vrmaRestPose

  return getVRMHumanoidRestPose(gltf)
}

export function getVRMAnimationSourceReport(gltf: VRMGltfJson): VRMAnimationSourceReport {
  if (gltf.extensions?.VRMC_vrm_animation?.humanoid?.humanBones != null) {
    return {
      type: 'VRMC_vrm_animation',
      humanoidBoneCount: Object.keys(getVRMAHumanoidRestPose(gltf)).length,
    }
  }

  if (gltf.extensions?.VRMC_vrm?.humanoid?.humanBones != null) {
    return {
      type: 'VRM1',
      humanoidBoneCount: Object.keys(getVRMHumanoidRestPose(gltf)).length,
    }
  }

  if (gltf.extensions?.VRM?.humanoid?.humanBones != null) {
    return {
      type: 'VRM0',
      humanoidBoneCount: Object.keys(getVRMHumanoidRestPose(gltf)).length,
    }
  }

  return {
    type: 'unknown',
    humanoidBoneCount: 0,
  }
}

export function getVRMHumanoidNodeNames(gltf: VRMGltfJson): VRMHumanoidNodeNames {
  const restPose = getVRMHumanoidRestPose(gltf)
  const names: VRMHumanoidNodeNames = {}
  for (const bone of VRM_HUMANOID_BONES) {
    const name = restPose[bone]?.name
    if (name != null) names[bone] = name
  }
  return names
}

export function getVRMAHumanoidNodeNames(gltf: VRMGltfJson): VRMHumanoidNodeNames {
  const restPose = getVRMAHumanoidRestPose(gltf)
  const names: VRMHumanoidNodeNames = {}
  for (const bone of VRM_HUMANOID_BONES) {
    const name = restPose[bone]?.name
    if (name != null) names[bone] = name
  }
  return names
}

export function createVRMHumanoidBindings(source: VRMHumanoidRestPose, target: VRMHumanoidRestPose): VRMHumanoidBinding[] {
  const bindings: VRMHumanoidBinding[] = []
  const shiftedThumbBones = new Set<VRMHumanoidBoneName>()

  for (const side of ['left', 'right'] as const) {
    const metacarpal = `${side}ThumbMetacarpal` as VRMHumanoidBoneName
    const proximal = `${side}ThumbProximal` as VRMHumanoidBoneName
    const intermediate = `${side}ThumbIntermediate` as VRMHumanoidBoneName
    const distal = `${side}ThumbDistal` as VRMHumanoidBoneName

    if (source[metacarpal] != null && source[proximal] != null && target[metacarpal] == null && target[intermediate] != null) {
      const shiftedThumbPairs: Array<[VRMHumanoidBoneName, VRMHumanoidBoneName]> = [
        [metacarpal, proximal],
        [proximal, intermediate],
        [distal, distal],
      ]

      for (const [sourceBone, targetBone] of shiftedThumbPairs) {
        const sourceNode = source[sourceBone]
        const targetNode = target[targetBone]
        if (sourceNode == null || targetNode == null) continue

        bindings.push(createBinding(sourceBone, sourceNode, targetNode))
        shiftedThumbBones.add(sourceBone)
        shiftedThumbBones.add(targetBone)
      }
    }
  }

  for (const bone of VRM_HUMANOID_BONES) {
    if (shiftedThumbBones.has(bone)) continue

    const sourceNode = source[bone]
    const targetNode = target[bone]
    if (sourceNode == null || targetNode == null) continue

    bindings.push(createBinding(bone, sourceNode, targetNode, getMissingTargetAncestors(bone, source, target)))
  }

  return bindings
}

function getMissingTargetAncestors(
  bone: VRMHumanoidBoneName,
  source: VRMHumanoidRestPose,
  target: VRMHumanoidRestPose
): NonNullable<VRMHumanoidBinding['extraSourceBones']> {
  const ancestors: NonNullable<VRMHumanoidBinding['extraSourceBones']> = []
  let parent = VRM_HUMANOID_PARENT[bone]

  while (parent != null) {
    const sourceNode = source[parent]
    if (target[parent] != null) break

    if (sourceNode != null) {
      ancestors.unshift({
        bone: parent,
        sourceName: sourceNode.name,
        sourceRestLocalRotation: sourceNode.localRotation,
        sourceRestWorldRotation: sourceNode.worldRotation,
      })
    }

    parent = VRM_HUMANOID_PARENT[parent]
  }

  return ancestors
}

function createBinding(
  bone: VRMHumanoidBoneName,
  sourceNode: NonNullable<VRMHumanoidRestPose[VRMHumanoidBoneName]>,
  targetNode: NonNullable<VRMHumanoidRestPose[VRMHumanoidBoneName]>,
  extraSourceBones: NonNullable<VRMHumanoidBinding['extraSourceBones']> = []
): VRMHumanoidBinding {
  return {
    bone,
    sourceName: sourceNode.name,
    targetName: targetNode.name,
    isHips: bone === 'hips',
    extraSourceBones,
    sourceRestLocalRotation: sourceNode.localRotation,
    sourceRestWorldRotation: sourceNode.worldRotation,
    targetRestLocalRotation: targetNode.localRotation,
    targetRestWorldRotation: targetNode.worldRotation,
  }
}
