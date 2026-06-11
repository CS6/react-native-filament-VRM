import * as React from 'react'
import { Button, Image, StyleSheet, Text, View } from 'react-native'
import {
  Camera,
  createVRMMaterialFallbackGlb,
  createVRMHumanoidBindings,
  DefaultLight,
  FilamentScene,
  FilamentView,
  getGltfAnimationClips,
  getVRMCompatibilityReport,
  getVRMHumanoidRestPose,
  getVRMAHumanoidRestPose,
  loadGltfDocument,
  loadGltfJson,
  ModelRenderer,
  useBuffer,
  useDisposableResource,
  useFilamentContext,
  useModel,
  VRMAnimationRetargeter,
  VRMHumanoidBinding,
  VRMVersion,
} from 'react-native-filament'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { SafeAreaView } from 'react-native-safe-area-context'
import AvatarSampleA from '@assets/AvatarSample_A.vrm'
import ClappingVrma from '@assets/Clapping.vrma'
import JumpVrma from '@assets/Jump.vrma'
import LookAroundVrma from '@assets/LookAround.vrma'
import RelaxVrma from '@assets/Relax.vrma'
import SeedSan from '@assets/Seed-san.vrm'
import TkVrmViewerSample from '@assets/TkVrmViewerSample.vrm'

const AVATARS = [
  { label: 'Avatar A', source: AvatarSampleA },
  { label: 'Seed VRM1', source: SeedSan },
  { label: 'TK VRM0', source: TkVrmViewerSample },
]

const MOTIONS = [
  { label: 'Jump', source: JumpVrma },
  { label: 'Relax', source: RelaxVrma },
  { label: 'Clap', source: ClappingVrma },
  { label: 'Look', source: LookAroundVrma },
]

const AUTO_CYCLE_INTERVAL_MS = 5000

type ExampleModelSource = number | { uri: string }

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    const triplet = (a << 16) | (b << 8) | c

    output += chars[(triplet >> 18) & 0x3f]
    output += chars[(triplet >> 12) & 0x3f]
    output += index + 1 < bytes.length ? chars[(triplet >> 6) & 0x3f] : '='
    output += index + 2 < bytes.length ? chars[triplet & 0x3f] : '='
  }

  return output
}

function resolveAssetUri(source: number): string {
  const asset = Image.resolveAssetSource(source)
  if (asset == null) {
    throw new Error(`Failed to resolve VRM asset: ${source}`)
  }
  return asset.uri
}

function useVRMMaterialFallbackSource(source: number): ExampleModelSource {
  const [fallbackSource, setFallbackSource] = React.useState<ExampleModelSource>(source)

  React.useEffect(() => {
    let isMounted = true
    setFallbackSource(source)

    const writeFallback = async () => {
      const response = await fetch(resolveAssetUri(source))
      if (!response.ok) {
        throw new Error(`Failed to load VRM source for fallback: ${response.status}`)
      }

      const patchedBuffer = createVRMMaterialFallbackGlb(await response.arrayBuffer())
      const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/rn-filament-vrm-fallback-${source}.vrm`
      await ReactNativeBlobUtil.fs.writeFile(path, toBase64(patchedBuffer), 'base64')

      if (isMounted) {
        setFallbackSource({ uri: `file://${path}` })
      }
    }

    writeFallback().catch((error) => {
      console.log('Failed to create VRM material fallback', error)
    })

    return () => {
      isMounted = false
    }
  }, [source])

  return fallbackSource
}

function useHiddenFilamentAsset(source: number) {
  const { engine, workletContext } = useFilamentContext()
  const assetBuffer = useBuffer({ source, releaseOnUnmount: false })

  return useDisposableResource(() => {
    if (assetBuffer == null) return

    return workletContext.runAsync(() => {
      'worklet'
      return engine.loadAsset(assetBuffer)
    })
  }, [assetBuffer, workletContext, engine])
}

function Renderer({
  animationLabel,
  animationSource,
  modelLabel,
  modelMetadataSource,
  modelSource,
}: {
  animationLabel: string
  animationSource: number
  modelLabel: string
  modelMetadataSource: number
  modelSource: ExampleModelSource
}) {
  const vrmModel = useModel(modelSource)
  const vrmaAsset = useHiddenFilamentAsset(animationSource)
  const [bindings, setBindings] = React.useState<VRMHumanoidBinding[]>([])
  const [targetVersion, setTargetVersion] = React.useState<VRMVersion>('unknown')

  React.useEffect(() => {
    let isMounted = true

    Promise.all([loadGltfDocument(animationSource), loadGltfJson(modelMetadataSource)])
      .then(([vrmaDocument, vrmGltf]) => {
        if (!isMounted) return

        const vrmaGltf = vrmaDocument.json
        const nextBindings = createVRMHumanoidBindings(getVRMAHumanoidRestPose(vrmaGltf), getVRMHumanoidRestPose(vrmGltf))
        const clips = getGltfAnimationClips(vrmaDocument)
        const compatibility = getVRMCompatibilityReport(vrmGltf)
        console.log(
          `VRMA retarget ${modelLabel} / ${animationLabel}: ${nextBindings.length} bindings, ${clips.length} clips, ${clips[0]?.channels.length ?? 0} channels, ${clips[0]?.duration ?? 0}s`
        )
        console.log(
          `VRM compatibility ${modelLabel}: version=${compatibility.version}, bones=${compatibility.humanoidBoneCount}, unsupported=${compatibility.unsupportedExtensions.join(',') || 'none'}, fallback=${compatibility.fallbackExtensions.join(',') || 'none'}`
        )
        for (const warning of compatibility.warnings) {
          console.log(`VRM compatibility warning ${modelLabel}: ${warning}`)
        }
        setTargetVersion(compatibility.version)
        setBindings(nextBindings)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`Failed to parse VRM/VRMA humanoid metadata for ${modelLabel} / ${animationLabel}: ${message}`)
      })

    return () => {
      isMounted = false
    }
  }, [animationLabel, animationSource, modelLabel, modelMetadataSource])

  return (
    <View style={styles.container}>
      <FilamentView style={styles.filamentView}>
        <Camera cameraPosition={[0, 0.25, -3]} cameraTarget={[0, 0, 0]} />
        <DefaultLight />
        {vrmModel.state === 'loaded' && <ModelRenderer model={vrmModel} transformToUnitCube />}
        {vrmModel.state === 'loaded' && vrmaAsset != null && bindings.length > 0 && (
          <VRMAnimationRetargeter sourceAsset={vrmaAsset} targetModel={vrmModel} bindings={bindings} targetVersion={targetVersion} />
        )}
      </FilamentView>
    </View>
  )
}

export function VRMModel() {
  const [count, setCount] = React.useState(0)
  const [avatarIndex, setAvatarIndex] = React.useState(0)
  const [motionIndex, setMotionIndex] = React.useState(0)
  const [isAutoCycleEnabled, setIsAutoCycleEnabled] = React.useState(false)
  const avatar = AVATARS[avatarIndex] ?? AVATARS[0]
  const motion = MOTIONS[motionIndex] ?? MOTIONS[0]
  const modelSource = useVRMMaterialFallbackSource(avatar.source)

  React.useEffect(() => {
    if (!isAutoCycleEnabled) return

    const interval = setInterval(() => {
      setMotionIndex((currentMotionIndex) => {
        const nextMotionIndex = (currentMotionIndex + 1) % MOTIONS.length
        if (nextMotionIndex === 0) {
          setAvatarIndex((currentAvatarIndex) => (currentAvatarIndex + 1) % AVATARS.length)
        }
        return nextMotionIndex
      })
    }, AUTO_CYCLE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isAutoCycleEnabled])

  return (
    <SafeAreaView style={styles.container}>
      <FilamentScene key={count}>
        <Renderer
          key={`${avatar.source}-${motion.source}-${typeof modelSource === 'object' ? modelSource.uri : modelSource}`}
          animationLabel={motion.label}
          animationSource={motion.source}
          modelLabel={avatar.label}
          modelMetadataSource={avatar.source}
          modelSource={modelSource}
        />
      </FilamentScene>
      <View style={styles.selectionBar}>
        <Text style={styles.selectionText}>
          {avatar.label} / {motion.label}
        </Text>
      </View>
      <View style={styles.controls}>
        {AVATARS.map((item, index) => (
          <Button key={item.label} title={item.label} onPress={() => setAvatarIndex(index)} />
        ))}
      </View>
      <View style={styles.controls}>
        {MOTIONS.map((item, index) => (
          <Button key={item.label} title={item.label} onPress={() => setMotionIndex(index)} />
        ))}
      </View>
      <View style={styles.controls}>
        <Button title={isAutoCycleEnabled ? 'Stop Auto' : 'Auto'} onPress={() => setIsAutoCycleEnabled((value) => !value)} />
        <Button title="Rerender" onPress={() => setCount((c) => c + 1)} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filamentView: {
    flex: 1,
    backgroundColor: '#101820',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  selectionBar: {
    alignItems: 'center',
    backgroundColor: '#101820',
    paddingBottom: 6,
    paddingTop: 6,
  },
  selectionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
})
