import type { VRMGltfAnimationChannel, VRMGltfAnimationClip, VRMGltfDocument, VRMGltfJson } from './types'

const GL_FLOAT_COMPONENT_TYPE = 5126

function getGltfJson(input: VRMGltfJson | VRMGltfDocument): VRMGltfJson {
  return 'json' in input ? input.json : input
}

function getBinaryChunk(input: VRMGltfJson | VRMGltfDocument): Uint8Array | undefined {
  return 'json' in input ? input.binaryChunk : undefined
}

function getAnimationDuration(input: VRMGltfJson | VRMGltfDocument, inputAccessorIndex: number | undefined): number {
  if (inputAccessorIndex == null) return 0

  const gltf = getGltfJson(input)
  const max = gltf.accessors?.[inputAccessorIndex]?.max
  const duration = max?.[0]
  if (typeof duration === 'number') return duration

  return getScalarFloatAccessorMax(input, inputAccessorIndex)
}

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

function getScalarFloatAccessorMax(input: VRMGltfJson | VRMGltfDocument, accessorIndex: number): number {
  const gltf = getGltfJson(input)
  const binaryChunk = getBinaryChunk(input)
  if (binaryChunk == null) return 0

  const accessor = gltf.accessors?.[accessorIndex]
  const bufferView = accessor?.bufferView != null ? gltf.bufferViews?.[accessor.bufferView] : undefined
  if (
    accessor?.componentType !== GL_FLOAT_COMPONENT_TYPE ||
    accessor.type !== 'SCALAR' ||
    accessor.count == null ||
    bufferView == null ||
    (bufferView.buffer != null && bufferView.buffer !== 0) ||
    bufferView.byteLength == null
  ) {
    return 0
  }

  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const byteStride = bufferView.byteStride ?? 4
  const dataView = new DataView(binaryChunk.buffer, binaryChunk.byteOffset, binaryChunk.byteLength)
  let max = Number.NEGATIVE_INFINITY

  for (let index = 0; index < accessor.count; index++) {
    const offset = byteOffset + index * byteStride
    if (offset + 4 > binaryChunk.byteLength) break
    max = Math.max(max, dataView.getFloat32(offset, true))
  }

  return Number.isFinite(max) ? max : 0
}

export function getGltfAnimationClips(input: VRMGltfJson | VRMGltfDocument): VRMGltfAnimationClip[] {
  const gltf = getGltfJson(input)

  return (gltf.animations ?? []).map((animation, index) => {
    let duration = 0
    const channels: VRMGltfAnimationChannel[] = []

    for (const channel of animation.channels ?? []) {
      const sampler = channel.sampler != null ? animation.samplers?.[channel.sampler] : undefined
      const nodeIndex = channel.target?.node
      const path = channel.target?.path
      if (nodeIndex == null || path == null) continue

      duration = Math.max(duration, getAnimationDuration(input, sampler?.input))
      channels.push({
        nodeIndex,
        nodeName: getNodeName(gltf, nodeIndex),
        path,
        interpolation: sampler?.interpolation,
        inputAccessor: sampler?.input,
        outputAccessor: sampler?.output,
      })
    }

    return {
      index,
      name: animation.name ?? `Animation ${index}`,
      duration,
      channels,
    }
  })
}
