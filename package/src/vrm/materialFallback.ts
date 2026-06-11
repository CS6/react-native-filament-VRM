import { parseGlbDocument } from './gltf'
import type { VRMGltfJson, VRMMaterialFallbackOptions } from './types'

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a
const GLB_BIN_CHUNK_TYPE = 0x004e4942
const VRM1_RUNTIME_EXTENSIONS = new Set(['VRMC_materials_mtoon', 'VRMC_node_constraint', 'VRMC_springBone'])

function writeUint32LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
  bytes[offset + 2] = (value >> 16) & 0xff
  bytes[offset + 3] = (value >> 24) & 0xff
}

function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text)
  }

  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index++) {
    bytes[index] = text.charCodeAt(index) & 0xff
  }
  return bytes
}

function padTo4Bytes(bytes: Uint8Array, padByte: number): Uint8Array {
  const padding = (4 - (bytes.length % 4)) % 4
  if (padding === 0) return bytes

  const padded = new Uint8Array(bytes.length + padding)
  padded.set(bytes)
  padded.fill(padByte, bytes.length)
  return padded
}

function removeExtensions(extensions: string[] | undefined, shouldRemove: (extension: string) => boolean): string[] | undefined {
  if (extensions == null) return undefined

  const nextExtensions = extensions.filter((extension) => !shouldRemove(extension))
  return nextExtensions.length > 0 ? nextExtensions : undefined
}

export function createVRMMaterialFallbackGltf(gltf: VRMGltfJson, options: VRMMaterialFallbackOptions = {}): VRMGltfJson {
  const { removeUnsupportedVRMExtensions = true } = options
  const nextGltf = JSON.parse(JSON.stringify(gltf)) as VRMGltfJson
  let usesUnlit = false

  for (const material of nextGltf.materials ?? []) {
    const extensions = material.extensions
    if (extensions?.VRMC_materials_mtoon == null) continue

    usesUnlit = true
    material.extensions = {
      ...extensions,
      KHR_materials_unlit: {},
    }
    delete material.extensions.VRMC_materials_mtoon

    if (Object.keys(material.extensions).length === 0) {
      delete material.extensions
    }

    material.pbrMetallicRoughness = {
      ...(material.pbrMetallicRoughness ?? {}),
      metallicFactor: 0,
      roughnessFactor: material.pbrMetallicRoughness?.roughnessFactor ?? 1,
    }
  }

  const shouldRemoveExtension = (extension: string) =>
    extension === 'VRMC_materials_mtoon' || (removeUnsupportedVRMExtensions && VRM1_RUNTIME_EXTENSIONS.has(extension))

  nextGltf.extensionsUsed = removeExtensions(nextGltf.extensionsUsed, shouldRemoveExtension)
  if (nextGltf.extensionsRequired != null) {
    nextGltf.extensionsRequired = removeExtensions(nextGltf.extensionsRequired, shouldRemoveExtension)
  }

  if (usesUnlit) {
    nextGltf.extensionsUsed = Array.from(new Set([...(nextGltf.extensionsUsed ?? []), 'KHR_materials_unlit']))
  }

  return nextGltf
}

export function serializeGlbDocument(gltf: VRMGltfJson, binaryChunk?: Uint8Array): ArrayBuffer {
  const jsonChunk = padTo4Bytes(encodeUtf8(JSON.stringify(gltf)), 0x20)
  const binChunk = binaryChunk != null ? padTo4Bytes(binaryChunk, 0) : undefined
  const byteLength = 12 + 8 + jsonChunk.length + (binChunk != null ? 8 + binChunk.length : 0)
  const bytes = new Uint8Array(byteLength)

  writeUint32LE(bytes, 0, GLB_MAGIC)
  writeUint32LE(bytes, 4, GLB_VERSION)
  writeUint32LE(bytes, 8, byteLength)
  writeUint32LE(bytes, 12, jsonChunk.length)
  writeUint32LE(bytes, 16, GLB_JSON_CHUNK_TYPE)
  bytes.set(jsonChunk, 20)

  if (binChunk != null) {
    const binHeaderOffset = 20 + jsonChunk.length
    writeUint32LE(bytes, binHeaderOffset, binChunk.length)
    writeUint32LE(bytes, binHeaderOffset + 4, GLB_BIN_CHUNK_TYPE)
    bytes.set(binChunk, binHeaderOffset + 8)
  }

  return bytes.buffer
}

export function createVRMMaterialFallbackGlb(buffer: ArrayBuffer, options?: VRMMaterialFallbackOptions): ArrayBuffer {
  const document = parseGlbDocument(buffer)
  const gltf = createVRMMaterialFallbackGltf(document.json, options)
  return serializeGlbDocument(gltf, document.binaryChunk)
}
