import { getVRMHumanoidRestPose } from './humanoid'
import type { VRM0LookAtRangeMap, VRMGltfJson, VRMLookAtBoneBinding, VRMLookAtExpressionBinding, VRMLookAtRangeMap } from './types'

const LOOK_AT_EXPRESSION_NAMES = {
  down: 'lookDown',
  left: 'lookLeft',
  right: 'lookRight',
  up: 'lookUp',
} as const

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

function getRangeMap(rangeMap: VRMLookAtRangeMap | undefined): Required<VRMLookAtRangeMap> {
  return {
    inputMaxValue: rangeMap?.inputMaxValue ?? 90,
    outputScale: rangeMap?.outputScale ?? 1,
  }
}

function getVRM0RangeMap(rangeMap: VRM0LookAtRangeMap | undefined): Required<VRMLookAtRangeMap> {
  return {
    inputMaxValue: rangeMap?.xRange ?? 90,
    outputScale: rangeMap?.yRange ?? 0,
  }
}

export function createVRMLookAtExpressionBindings(sourceGltf: VRMGltfJson, targetGltf: VRMGltfJson): VRMLookAtExpressionBinding[] {
  const sourceName = getNodeName(sourceGltf, sourceGltf.extensions?.VRMC_vrm_animation?.lookAt?.node)
  const lookAt = targetGltf.extensions?.VRMC_vrm?.lookAt
  const targetExpressions = targetGltf.extensions?.VRMC_vrm?.expressions?.preset
  if (sourceName == null || lookAt?.type !== 'expression' || targetExpressions == null) return []

  const rangeMaps = {
    down: getRangeMap(lookAt.rangeMapVerticalDown),
    left: getRangeMap(lookAt.rangeMapHorizontalOuter),
    right: getRangeMap(lookAt.rangeMapHorizontalOuter),
    up: getRangeMap(lookAt.rangeMapVerticalUp),
  }
  const bindings: VRMLookAtExpressionBinding[] = []

  for (const direction of Object.keys(LOOK_AT_EXPRESSION_NAMES) as Array<keyof typeof LOOK_AT_EXPRESSION_NAMES>) {
    const expressionName = LOOK_AT_EXPRESSION_NAMES[direction]
    const expression = targetExpressions[expressionName]
    for (const bind of expression?.morphTargetBinds ?? []) {
      const targetName = getNodeName(targetGltf, bind.node)
      if (targetName == null || bind.index == null) continue

      bindings.push({
        sourceName,
        direction,
        expressionName,
        isBinary: expression?.isBinary === true,
        targetName,
        morphTargetIndex: bind.index,
        weight: bind.weight ?? 1,
        inputMaxValue: rangeMaps[direction].inputMaxValue,
        outputScale: rangeMaps[direction].outputScale,
      })
    }
  }

  return bindings
}

export function createVRMLookAtBoneBindings(sourceGltf: VRMGltfJson, targetGltf: VRMGltfJson): VRMLookAtBoneBinding[] {
  const sourceName = getNodeName(sourceGltf, sourceGltf.extensions?.VRMC_vrm_animation?.lookAt?.node)
  if (sourceName == null) return []

  const restPose = getVRMHumanoidRestPose(targetGltf)
  const leftEye = restPose.leftEye
  const rightEye = restPose.rightEye
  if (leftEye == null || rightEye == null) return []

  const vrm1LookAt = targetGltf.extensions?.VRMC_vrm?.lookAt
  const vrm0LookAt = targetGltf.extensions?.VRM?.firstPerson
  const isVRM1BoneLookAt = vrm1LookAt?.type === 'bone'
  const isVRM0BoneLookAt = vrm0LookAt?.lookAtTypeName === 'Bone'
  if (!isVRM1BoneLookAt && !isVRM0BoneLookAt) return []

  const ranges = isVRM1BoneLookAt
    ? {
        horizontalInner: getRangeMap(vrm1LookAt?.rangeMapHorizontalInner),
        horizontalOuter: getRangeMap(vrm1LookAt?.rangeMapHorizontalOuter),
        verticalDown: getRangeMap(vrm1LookAt?.rangeMapVerticalDown),
        verticalUp: getRangeMap(vrm1LookAt?.rangeMapVerticalUp),
      }
    : {
        horizontalInner: getVRM0RangeMap(vrm0LookAt?.lookAtHorizontalInner),
        horizontalOuter: getVRM0RangeMap(vrm0LookAt?.lookAtHorizontalOuter),
        verticalDown: getVRM0RangeMap(vrm0LookAt?.lookAtVerticalDown),
        verticalUp: getVRM0RangeMap(vrm0LookAt?.lookAtVerticalUp),
      }

  return [
    {
      eye: 'left',
      sourceName,
      targetName: leftEye.name,
      targetRestLocalRotation: leftEye.localRotation,
      ...ranges,
    },
    {
      eye: 'right',
      sourceName,
      targetName: rightEye.name,
      targetRestLocalRotation: rightEye.localRotation,
      ...ranges,
    },
  ]
}
