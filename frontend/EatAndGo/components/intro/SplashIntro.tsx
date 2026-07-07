import React, { useEffect } from 'react';
import { StyleSheet, View, Image, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const { width: SCREEN_W } = Dimensions.get('window');

const GOLD = '#D4AF37';
const GOLD_LIGHT = '#FFC845';
const NAVY_DARK = '#05070C';
const NAVY_BRAND = '#1E2A78';

const LOGO_SIZE = Math.min(SCREEN_W * 0.46, 200);
const RING_SIZE = LOGO_SIZE + 56;
const GLOW_SIZE = LOGO_SIZE * 1.7;
const STAGE_SIZE = RING_SIZE + 40;
const RING_RADIUS = RING_SIZE / 2 - 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LOGO_SOURCE = require('@/assets/images/splash-icon.png');

// Centre un élément carré de `size` au milieu d'un conteneur STAGE_SIZE x STAGE_SIZE
function centeredBox(size: number) {
  return {
    position: 'absolute' as const,
    width: size,
    height: size,
    left: (STAGE_SIZE - size) / 2,
    top: (STAGE_SIZE - size) / 2,
  };
}

interface ParticleConfig {
  id: string;
  leftPct: number;
  size: number;
  phase: number;
  drift: number;
}

const PARTICLES: ParticleConfig[] = [
  { id: 'p1', leftPct: 12, size: 3, phase: 0.05, drift: 90 },
  { id: 'p2', leftPct: 22, size: 2, phase: 0.42, drift: 70 },
  { id: 'p3', leftPct: 34, size: 4, phase: 0.18, drift: 110 },
  { id: 'p4', leftPct: 48, size: 2.5, phase: 0.63, drift: 85 },
  { id: 'p5', leftPct: 58, size: 3, phase: 0.3, drift: 95 },
  { id: 'p6', leftPct: 68, size: 2, phase: 0.78, drift: 65 },
  { id: 'p7', leftPct: 77, size: 3.5, phase: 0.12, drift: 105 },
  { id: 'p8', leftPct: 85, size: 2.5, phase: 0.55, drift: 80 },
  { id: 'p9', leftPct: 92, size: 2, phase: 0.88, drift: 70 },
];

function Particle({
  progress,
  config,
}: {
  progress: SharedValue<number>;
  config: ParticleConfig;
}) {
  const style = useAnimatedStyle(() => {
    'worklet';
    const t = (progress.value + config.phase) % 1;
    const opacity = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
    const translateY = -t * config.drift;
    const translateX = Math.sin(t * Math.PI * 2) * 5;
    return {
      opacity: opacity * 0.45,
      transform: [{ translateY }, { translateX }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: `${config.leftPct}%`,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
        },
        style,
      ]}
    />
  );
}

interface SplashIntroProps {
  onFinish: () => void;
  /** Pause avant le fondu de sortie, une fois tout révélé (ms). */
  holdMs?: number;
}

export default function SplashIntro({ onFinish, holdMs = 300 }: SplashIntroProps) {
  const rootOpacity = useSharedValue(1);

  const ringProgress = useSharedValue(0);
  const ringSpin = useSharedValue(0);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);

  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.9);

  const shineX = useSharedValue(-LOGO_SIZE);

  const lineWidth = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const taglineSpacing = useSharedValue(5);

  const particlesProgress = useSharedValue(0);

  // ── Timeline (ms, relatif au montage) ──────────────────────────────
  const T = {
    ringDelay: 150,
    ringDuration: 700,
    logoDelay: 350,
    logoDuration: 550,
    hapticAt: 700,
    shineDelay: 950,
    shineDuration: 650,
    lineDelay: 1500,
    lineDuration: 380,
    taglineDelay: 1750,
    taglineDuration: 450,
  };
  const revealEnd = T.taglineDelay + T.taglineDuration; // 2200
  const exitStart = revealEnd + holdMs;
  const exitDuration = 420;

  useEffect(() => {
    // Particules : boucle continue, démarre immédiatement
    particlesProgress.value = withRepeat(
      withTiming(1, { duration: 6500, easing: Easing.linear }),
      -1,
      false
    );

    // Anneau : se dessine puis tourne lentement en continu
    ringProgress.value = withDelay(
      T.ringDelay,
      withTiming(1, { duration: T.ringDuration, easing: Easing.out(Easing.cubic) })
    );
    ringSpin.value = withDelay(
      T.ringDelay + T.ringDuration,
      withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false)
    );

    // Sceau : ease-out-expo, arrivée nette et premium
    logoOpacity.value = withDelay(T.logoDelay, withTiming(1, { duration: T.logoDuration }));
    logoScale.value = withDelay(
      T.logoDelay,
      withTiming(1, {
        duration: T.logoDuration,
        easing: Easing.bezier(0.16, 1, 0.3, 1), // ease-out-expo
      })
    );

    // Glow : pulse doux en continu dès l'arrivée du sceau
    glowOpacity.value = withDelay(
      T.logoDelay,
      withSequence(
        withTiming(0.5, { duration: 450 }),
        withRepeat(
          withSequence(
            withTiming(0.28, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.5, { duration: 1300, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      )
    );
    glowScale.value = withDelay(
      T.logoDelay,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.96, { duration: 1500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );

    // Retour haptique léger à l'atterrissage du sceau
    const hapticTimer = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, T.hapticAt);

    // Reflet qui balaie le sceau
    shineX.value = withDelay(
      T.shineDelay,
      withTiming(LOGO_SIZE, { duration: T.shineDuration, easing: Easing.inOut(Easing.quad) })
    );

    // Trait doré
    lineWidth.value = withDelay(
      T.lineDelay,
      withTiming(1, { duration: T.lineDuration, easing: Easing.out(Easing.cubic) })
    );

    // Tagline : fade + resserrement du letter-spacing
    taglineOpacity.value = withDelay(T.taglineDelay, withTiming(1, { duration: T.taglineDuration }));
    taglineSpacing.value = withDelay(
      T.taglineDelay,
      withTiming(0.4, { duration: T.taglineDuration, easing: Easing.out(Easing.cubic) })
    );

    // Opaque dès le montage (voir useSharedValue(1) plus haut) — après la
    // pause, fondu de sortie qui déclenche onFinish exactement à la fin de
    // l'animation, pas de timer arbitraire.
    rootOpacity.value = withDelay(
      exitStart,
      withTiming(0, { duration: exitDuration, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      })
    );

    return () => clearTimeout(hapticTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));

  const ringGroupStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringSpin.value}deg` }],
  }));
  const ringAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - ringProgress.value),
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shineX.value }, { rotate: '20deg' }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    width: lineWidth.value * (LOGO_SIZE * 0.42),
    opacity: lineWidth.value,
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    letterSpacing: taglineSpacing.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, rootStyle]}>
      <LinearGradient
        colors={[NAVY_DARK, NAVY_BRAND]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Faisceaux très subtils — profondeur cinématique */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(212,175,55,0.05)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.beam, { transform: [{ rotate: '15deg' }] }]}
        />
        <LinearGradient
          colors={['transparent', 'rgba(212,175,55,0.035)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.beam, { left: SCREEN_W * 0.35, transform: [{ rotate: '-10deg' }] }]}
        />
      </View>

      {/* Particules dorées dérivant en fond */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {PARTICLES.map((p) => (
          <Particle key={p.id} progress={particlesProgress} config={p} />
        ))}
      </View>

      <View style={styles.center}>
        <View style={styles.stage}>
          {/* Glow doré pulsé */}
          <Animated.View style={[centeredBox(GLOW_SIZE), styles.glow, glowStyle]} />

          {/* Anneau qui se dessine puis tourne lentement */}
          <Animated.View style={[centeredBox(RING_SIZE), ringGroupStyle]}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(212,175,55,0.18)"
                strokeWidth={1}
                fill="none"
              />
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={GOLD_LIGHT}
                strokeWidth={1.5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                animatedProps={ringAnimatedProps}
                rotation={-90}
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
          </Animated.View>

          {/* Sceau EATQ.R */}
          <Animated.View style={[centeredBox(LOGO_SIZE), logoStyle]}>
            <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />

            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={<Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />}
            >
              <Animated.View style={[styles.shineBand, shineStyle]}>
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.85)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </MaskedView>
          </Animated.View>
        </View>

        {/* Trait doré */}
        <Animated.View style={[styles.line, lineStyle]} />

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, taglineStyle]}>
          Un serveur au service des serveurs
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  beam: {
    position: 'absolute',
    top: -SCREEN_W * 0.3,
    left: -SCREEN_W * 0.2,
    width: SCREEN_W * 0.6,
    height: SCREEN_W * 1.8,
  },
  particle: {
    position: 'absolute',
    bottom: '38%',
    backgroundColor: GOLD_LIGHT,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
  },
  glow: {
    borderRadius: GLOW_SIZE,
    backgroundColor: GOLD,
    opacity: 0,
    shadowColor: GOLD_LIGHT,
    shadowOpacity: 0.9,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  shineBand: {
    position: 'absolute',
    top: -LOGO_SIZE * 0.5,
    left: 0,
    width: LOGO_SIZE * 0.35,
    height: LOGO_SIZE * 2,
  },
  line: {
    height: 1.5,
    backgroundColor: GOLD_LIGHT,
    marginTop: 20,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});