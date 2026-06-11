import * as React from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  ModelRenderer,
  useModel,
  useVRMAnimation,
  useVRMMaterialFallbackSource,
  VRMAnimationRetargeter,
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
  modelSource: number | { uri: string }
}) {
  const vrmModel = useModel(modelSource)
  const vrmAnimation = useVRMAnimation(animationSource, modelMetadataSource)

  React.useEffect(() => {
    const retargeting = vrmAnimation.retargeting
    if (retargeting == null) {
      if (vrmAnimation.error != null) {
        console.log(`Failed to parse VRM/VRMA humanoid metadata for ${modelLabel} / ${animationLabel}: ${vrmAnimation.error.message}`)
      }
      return
    }

    console.log(
      `VRMA retarget ${modelLabel} / ${animationLabel}: ${retargeting.bindings.length} bindings, ${retargeting.expressionBindings.length} expression bindings, ${retargeting.lookAtExpressionBindings.length} lookAt bindings, ${retargeting.nodeConstraintBindings.length} node constraints, ${retargeting.clips.length} clips, ${retargeting.clips[0]?.channels.length ?? 0} channels, ${retargeting.clips[0]?.duration ?? 0}s`
    )
    console.log(
      `VRM compatibility ${modelLabel}: version=${retargeting.compatibility.version}, bones=${retargeting.compatibility.humanoidBoneCount}, unsupported=${retargeting.compatibility.unsupportedExtensions.join(',') || 'none'}, fallback=${retargeting.compatibility.fallbackExtensions.join(',') || 'none'}`
    )
    for (const warning of retargeting.compatibility.warnings) {
      console.log(`VRM compatibility warning ${modelLabel}: ${warning}`)
    }
  }, [animationLabel, modelLabel, vrmAnimation.error, vrmAnimation.retargeting])

  return (
    <View style={styles.container}>
      <FilamentView style={styles.filamentView}>
        <Camera cameraPosition={[0, 0.25, -3]} cameraTarget={[0, 0, 0]} />
        <DefaultLight />
        {vrmModel.state === 'loaded' && <ModelRenderer model={vrmModel} transformToUnitCube />}
        {vrmModel.state === 'loaded' && vrmAnimation.sourceAsset != null && vrmAnimation.retargeting != null && (
          <VRMAnimationRetargeter
            sourceAsset={vrmAnimation.sourceAsset}
            targetModel={vrmModel}
            bindings={vrmAnimation.retargeting.bindings}
            expressionBindings={vrmAnimation.retargeting.expressionBindings}
            lookAtExpressionBindings={vrmAnimation.retargeting.lookAtExpressionBindings}
            nodeConstraintBindings={vrmAnimation.retargeting.nodeConstraintBindings}
            targetVersion={vrmAnimation.retargeting.targetVersion}
          />
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
  const writeFallbackGlb = React.useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`
    await ReactNativeBlobUtil.fs.writeFile(path, toBase64(buffer), 'base64')
    return { uri: `file://${path}` }
  }, [])
  const modelFallback = useVRMMaterialFallbackSource(avatar.source, { writeFallbackGlb })

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
          key={`${avatar.source}-${motion.source}-${typeof modelFallback.source === 'object' ? modelFallback.source.uri : modelFallback.source}`}
          animationLabel={motion.label}
          animationSource={motion.source}
          modelLabel={avatar.label}
          modelMetadataSource={avatar.source}
          modelSource={modelFallback.source}
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
