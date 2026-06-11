import type { Float4 } from '../types'
import type { VRMExpressionBinding, VRMExpressionMaterialColorBindType, VRMExpressionMaterialColorBinding, VRMGltfJson } from './types'

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

function getMaterialPrimitiveTargets(gltf: VRMGltfJson, materialIndex: number | undefined): Array<{ primitiveIndex: number; targetName: string }> {
  if (materialIndex == null) return []

  return (gltf.nodes ?? []).flatMap((node) => {
    if (node.mesh == null || node.name == null) return []

    const mesh = gltf.meshes?.[node.mesh]
    return (mesh?.primitives ?? []).flatMap((primitive, primitiveIndex) =>
      primitive.material === materialIndex ? [{ primitiveIndex, targetName: node.name! }] : []
    )
  })
}

function getMaterialColorParameterName(type: VRMExpressionMaterialColorBindType | undefined): string | undefined {
  if (type === 'color') return 'baseColorFactor'
  if (type === 'emissionColor') return 'emissiveFactor'
  if (type === 'shadeColor') return 'shadeColorFactor'
  if (type === 'matcapColor') return 'matcapFactor'
  if (type === 'rimColor') return 'parametricRimColorFactor'
  if (type === 'outlineColor') return 'outlineColorFactor'
  return undefined
}

function getMaterialBaseColor(gltf: VRMGltfJson, materialIndex: number | undefined, type: VRMExpressionMaterialColorBindType | undefined): Float4 | undefined {
  if (materialIndex == null) return undefined
  const material = gltf.materials?.[materialIndex]
  if (material == null) return undefined

  if (type === 'color') return material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]
  if (type === 'emissionColor') {
    const emissiveFactor = material.emissiveFactor ?? [0, 0, 0]
    return [emissiveFactor[0], emissiveFactor[1], emissiveFactor[2], 1]
  }

  const mtoon = material.extensions?.VRMC_materials_mtoon as
    | {
        matcapFactor?: Float4
        outlineColorFactor?: Float4
        parametricRimColorFactor?: Float4
        shadeColorFactor?: Float4
      }
    | undefined
  if (type === 'shadeColor') return mtoon?.shadeColorFactor ?? [0, 0, 0, 1]
  if (type === 'matcapColor') return mtoon?.matcapFactor ?? [0, 0, 0, 1]
  if (type === 'rimColor') return mtoon?.parametricRimColorFactor ?? [0, 0, 0, 1]
  if (type === 'outlineColor') return mtoon?.outlineColorFactor ?? [0, 0, 0, 1]
  return undefined
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

export function createVRMExpressionMaterialColorBindings(sourceGltf: VRMGltfJson, targetGltf: VRMGltfJson): VRMExpressionMaterialColorBinding[] {
  const sourceNames = getVRMAExpressionNodeNames(sourceGltf)
  const bindings: VRMExpressionMaterialColorBinding[] = []
  const vrm1Expressions = targetGltf.extensions?.VRMC_vrm?.expressions

  for (const [groupName, expression] of Object.entries({
    ...(vrm1Expressions?.preset ?? {}),
    ...(vrm1Expressions?.custom ?? {}),
  })) {
    const sourceName = sourceNames[groupName]
    if (sourceName == null) continue

    for (const bind of expression?.materialColorBinds ?? []) {
      const parameterName = getMaterialColorParameterName(bind.type)
      const baseValue = getMaterialBaseColor(targetGltf, bind.material, bind.type)
      if (parameterName == null || baseValue == null || bind.targetValue == null) continue

      for (const target of getMaterialPrimitiveTargets(targetGltf, bind.material)) {
        bindings.push({
          baseValue,
          expressionName: groupName,
          parameterName,
          primitiveIndex: target.primitiveIndex,
          sourceName,
          targetName: target.targetName,
          targetValue: bind.targetValue,
        })
      }
    }
  }

  return bindings
}
