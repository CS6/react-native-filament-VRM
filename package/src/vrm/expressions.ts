import type { VRMExpressionBinding, VRMGltfJson } from './types'

const VRM0_PRESET_NAME_MAP: Record<string, string> = {
  a: 'aa',
  angry: 'angry',
  blink: 'blink',
  blink_l: 'blinkLeft',
  blink_r: 'blinkRight',
  e: 'ee',
  fun: 'happy',
  i: 'ih',
  joy: 'happy',
  neutral: 'neutral',
  o: 'oh',
  sorrow: 'sad',
  u: 'ou',
}

function normalizeExpressionName(name: string): string {
  return VRM0_PRESET_NAME_MAP[name] ?? name
}

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

function getMeshNodeName(gltf: VRMGltfJson, meshIndex: number | undefined): string | undefined {
  if (meshIndex == null) return undefined
  const node = gltf.nodes?.find((item) => item.mesh === meshIndex && item.name != null)
  return node?.name ?? gltf.meshes?.[meshIndex]?.name
}

export function getVRMAExpressionNodeNames(gltf: VRMGltfJson): Record<string, string> {
  const expressions = gltf.extensions?.VRMC_vrm_animation?.expressions
  const names: Record<string, string> = {}

  for (const [name, expression] of Object.entries(expressions?.preset ?? {})) {
    const nodeName = getNodeName(gltf, expression?.node)
    if (nodeName != null) names[name] = nodeName
  }

  for (const [name, expression] of Object.entries(expressions?.custom ?? {})) {
    const nodeName = getNodeName(gltf, expression?.node)
    if (nodeName != null) names[name] = nodeName
  }

  return names
}

export function createVRMExpressionBindings(sourceGltf: VRMGltfJson, targetGltf: VRMGltfJson): VRMExpressionBinding[] {
  const sourceNames = getVRMAExpressionNodeNames(sourceGltf)
  const bindings: VRMExpressionBinding[] = []

  const vrm1Expressions = targetGltf.extensions?.VRMC_vrm?.expressions
  for (const [groupName, expressions] of Object.entries({
    ...(vrm1Expressions?.preset ?? {}),
    ...(vrm1Expressions?.custom ?? {}),
  })) {
    const sourceName = sourceNames[groupName]
    if (sourceName == null) continue

    for (const bind of expressions?.morphTargetBinds ?? []) {
      const targetName = getNodeName(targetGltf, bind.node)
      if (targetName == null || bind.index == null) continue

      bindings.push({
        expressionName: groupName,
        sourceName,
        targetName,
        morphTargetIndex: bind.index,
        weight: bind.weight ?? 1,
      })
    }
  }

  const vrm0Expressions = targetGltf.extensions?.VRM?.blendShapeMaster?.blendShapeGroups
  for (const expression of vrm0Expressions ?? []) {
    const expressionName = normalizeExpressionName(expression.presetName ?? expression.name ?? '')
    if (expressionName === '') continue

    const sourceName = sourceNames[expressionName]
    if (sourceName == null) continue

    for (const bind of expression.binds ?? []) {
      const targetName = getMeshNodeName(targetGltf, bind.mesh)
      if (targetName == null || bind.index == null) continue

      bindings.push({
        expressionName,
        sourceName,
        targetName,
        morphTargetIndex: bind.index,
        weight: (bind.weight ?? 100) / 100,
      })
    }
  }

  return bindings
}
