import type { VRMGltfJson, VRMLookAtExpressionBinding, VRMLookAtRangeMap } from './types'

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

export function createVRMLookAtExpressionBindings(sourceGltf: VRMGltfJson, targetGltf: VRMGltfJson): VRMLookAtExpressionBinding[] {
  const sourceName = getNodeName(sourceGltf, sourceGltf.extensions?.VRMC_vrm_animation?.lookAt?.node)
  const lookAt = targetGltf.extensions?.VRMC_vrm?.lookAt
  const targetExpressions = targetGltf.extensions?.VRMC_vrm?.expressions?.preset
  if (sourceName == null || lookAt?.type !== 'expression' || targetExpressions == null) return []

  const rangeMaps = {
    down: getRangeMap(lookAt.rangeMapVerticalDown),
    left: getRangeMap(lookAt.rangeMapHorizontalInner),
    right: getRangeMap(lookAt.rangeMapHorizontalInner),
    up: getRangeMap(lookAt.rangeMapVerticalUp),
  }
  const bindings: VRMLookAtExpressionBinding[] = []

  for (const direction of Object.keys(LOOK_AT_EXPRESSION_NAMES) as Array<keyof typeof LOOK_AT_EXPRESSION_NAMES>) {
    const expression = targetExpressions[LOOK_AT_EXPRESSION_NAMES[direction]]
    for (const bind of expression?.morphTargetBinds ?? []) {
      const targetName = getNodeName(targetGltf, bind.node)
      if (targetName == null || bind.index == null) continue

      bindings.push({
        sourceName,
        direction,
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
