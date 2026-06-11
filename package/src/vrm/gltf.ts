import { Image } from 'react-native'
import type { BufferSource } from '../hooks/useBuffer'
import type { VRMGltfDocument, VRMGltfJson } from './types'

const GLB_MAGIC = 0x46546c67
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a
const GLB_BIN_CHUNK_TYPE = 0x004e4942

export function resolveBufferSourceUri(source: BufferSource): string {
  if (typeof source === 'object') return source.uri

  const asset = Image.resolveAssetSource(source)
  if (asset == null) {
    throw new Error(`Failed to resolve glTF source: ${source}`)
  }

  return asset.uri
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes)
  }

  let text = ''
  for (let i = 0; i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i] ?? 0)
  }
  return text
}

export function parseGlbJson(buffer: ArrayBuffer): VRMGltfJson {
  return parseGlbDocument(buffer).json
}

export function parseGlbDocument(buffer: ArrayBuffer): VRMGltfDocument {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 20 || readUint32LE(bytes, 0) !== GLB_MAGIC) {
    throw new Error('Invalid GLB file: missing glTF binary header')
  }

  const declaredLength = readUint32LE(bytes, 8)
  if (declaredLength > bytes.length) {
    throw new Error('Invalid GLB file: declared length exceeds buffer length')
  }

  let offset = 12
  let json: VRMGltfJson | undefined
  let binaryChunk: Uint8Array | undefined

  while (offset + 8 <= declaredLength) {
    const chunkLength = readUint32LE(bytes, offset)
    const chunkType = readUint32LE(bytes, offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    if (chunkEnd > declaredLength) {
      throw new Error('Invalid GLB file: chunk length exceeds file length')
    }

    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      json = JSON.parse(decodeUtf8(bytes.subarray(chunkStart, chunkEnd)).trim()) as VRMGltfJson
    } else if (chunkType === GLB_BIN_CHUNK_TYPE) {
      binaryChunk = bytes.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd
  }

  if (json == null) {
    throw new Error('Invalid GLB file: JSON chunk not found')
  }

  return { json, binaryChunk }
}

export async function loadGltfJson(source: BufferSource): Promise<VRMGltfJson> {
  return (await loadGltfDocument(source)).json
}

export async function loadGltfDocument(source: BufferSource): Promise<VRMGltfDocument> {
  const uri = resolveBufferSourceUri(source)
  const response = await fetch(uri)
  if (!response.ok) {
    throw new Error(`Failed to load glTF JSON from ${uri}: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  return parseGlbDocument(buffer)
}
