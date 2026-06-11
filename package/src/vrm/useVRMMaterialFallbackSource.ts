import { useEffect, useState } from 'react'
import type { BufferSource } from '../hooks/useBuffer'
import { resolveBufferSourceUri } from './gltf'
import { createVRMMaterialFallbackGlb } from './materialFallback'
import type { VRMMaterialFallbackSourceOptions, VRMMaterialFallbackSourceState } from './types'

function getFallbackFileName(source: BufferSource): string {
  if (typeof source === 'number') return `rn-filament-vrm-fallback-${source}.vrm`

  const normalizedUri = source.uri.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `rn-filament-vrm-fallback-${normalizedUri}.vrm`
}

export function useVRMMaterialFallbackSource(
  source: BufferSource,
  options: VRMMaterialFallbackSourceOptions
): VRMMaterialFallbackSourceState {
  const { enabled = true, fileName, writeFallbackGlb, removeUnsupportedVRMExtensions } = options
  const [fallbackSource, setFallbackSource] = useState<BufferSource>(source)
  const [error, setError] = useState<Error>()
  const [isLoading, setIsLoading] = useState(enabled)

  useEffect(() => {
    let isMounted = true

    setFallbackSource(source)
    setError(undefined)
    setIsLoading(enabled)

    if (!enabled) {
      return () => {
        isMounted = false
      }
    }

    const createFallback = async () => {
      const uri = resolveBufferSourceUri(source)
      const response = await fetch(uri)
      if (!response.ok) {
        throw new Error(`Failed to load VRM source for material fallback: ${response.status}`)
      }

      const patchedBuffer = createVRMMaterialFallbackGlb(await response.arrayBuffer(), { removeUnsupportedVRMExtensions })
      const nextSource = await writeFallbackGlb(patchedBuffer, fileName ?? getFallbackFileName(source))

      if (isMounted) {
        setFallbackSource(nextSource)
      }
    }

    createFallback()
      .catch((unknownError) => {
        if (isMounted) {
          setError(unknownError instanceof Error ? unknownError : new Error(String(unknownError)))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [enabled, fileName, removeUnsupportedVRMExtensions, source, writeFallbackGlb])

  return {
    source: fallbackSource,
    error,
    isLoading,
  }
}
