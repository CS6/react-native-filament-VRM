import { useEffect, useState } from 'react'
import { useBuffer, type BufferSource } from '../hooks/useBuffer'
import { useDisposableResource } from '../hooks/useDisposableResource'
import { useFilamentContext } from '../hooks/useFilamentContext'
import { loadVRMAnimationRetargeting } from './retargetingConfig'
import type { VRMAnimationRetargeting, VRMAnimationRetargetingOptions, VRMAnimationState } from './types'

const DEFAULT_RETARGETING_OPTIONS: VRMAnimationRetargetingOptions = {}

export function useVRMAnimation(vrmaSource: BufferSource, vrmSource: BufferSource, options: VRMAnimationRetargetingOptions = DEFAULT_RETARGETING_OPTIONS): VRMAnimationState {
  const { engine, workletContext } = useFilamentContext()
  const assetBuffer = useBuffer({ source: vrmaSource, releaseOnUnmount: false })
  const [retargeting, setRetargeting] = useState<VRMAnimationRetargeting>()
  const [error, setError] = useState<Error>()

  const sourceAsset = useDisposableResource(() => {
    if (assetBuffer == null) return

    return workletContext.runAsync(() => {
      'worklet'
      const asset = engine.loadAsset(assetBuffer)
      assetBuffer.release()
      return asset
    })
  }, [assetBuffer, workletContext, engine])

  useEffect(() => {
    let isMounted = true
    setRetargeting(undefined)
    setError(undefined)

    loadVRMAnimationRetargeting(vrmaSource, vrmSource, options)
      .then((nextRetargeting) => {
        if (isMounted) {
          setRetargeting(nextRetargeting)
        }
      })
      .catch((unknownError) => {
        if (isMounted) {
          setError(unknownError instanceof Error ? unknownError : new Error(String(unknownError)))
        }
      })

    return () => {
      isMounted = false
    }
  }, [options, vrmaSource, vrmSource])

  return {
    sourceAsset,
    retargeting,
    error,
    isLoading: sourceAsset == null || retargeting == null,
  }
}
