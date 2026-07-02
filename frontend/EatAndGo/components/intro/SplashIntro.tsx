/**
 * SplashIntro.tsx (v2 — utilise le vrai mark EATQ.R)
 * ─────────────────────────────────────────────────────────────────────────
 * Séquence : fond dégradé → le sceau EATQ.R (logo-mark-gold-transparent.png)
 * apparaît avec un léger glow pulsé → un reflet doré balaie le métal
 * (façon feuille d'or qui capte la lumière) → un trait doré se dessine
 * dessous → tagline.
 *
 * Dépendances :
 *   npx expo install expo-linear-gradient
 *   npx expo install @react-native-masked-view/masked-view   ← pour le reflet
 *   react-native-reanimated (déjà présent)
 *
 * Si vous ne voulez pas ajouter @react-native-masked-view/masked-view,
 * supprimez le bloc "REFLET (shine)" délimité ci-dessous : le reste
 * fonctionne très bien sans (fade + glow + trait doré).
 *
 * Placez logo-mark-gold-transparent.png dans assets/images/ et ajustez
 * le chemin du require() plus bas si besoin.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, Image, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
// ── REFLET (shine) — retirez cet import + le bloc plus bas si vous
// ne voulez pas ajouter la dépendance @react-native-masked-view/masked-view
import MaskedView from '@react-native-masked-view/masked-view';

const { width: SCREEN_W } = Dimensions.get('window');

const GOLD = '#D4AF37';
const GOLD_LIGHT = '#FFC845';
const NAVY_DARK = '#05070C'; // proche du fond réel du logo (quasi-noir)
const NAVY_BRAND = '#1E2A78'; // token de design de l'app

const LOGO_SIZE = Math.min(SCREEN_W * 0.5, 220);

// Même fichier que celui référencé dans app.json (expo-splash-screen) —
// une seule source de vérité pour le mark natif + l'intro JS.
const LOGO_SOURCE = require('../assets/images/splash-icon.png');

interface SplashIntroProps {
  onFinish: () => void;
  duration?: number;
  /** Coupez le reflet animé si vous n'avez pas installé masked-view */
  enableShine?: boolean;
}

export default function SplashIntro({
  onFinish,
  duration = 2400,
  enableShine = true,
}: SplashIntroProps) {
  const bgOpacity = useSharedValue(0);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.82);

  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.9);

  const shineX = useSharedValue(-LOGO_SIZE);

  const lineWidth = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  const T = {
    bgIn: 260,
    logoDelay: 150,
    logoDuration: 500,
    glowDelay: 150,
    shineDelay: 650,
    shineDuration: 650,
    lineDelay: 1350,
    lineDuration: 380,
    taglineDelay: 1650,
    taglineDuration: 380,
  };

  useEffect(() => {
    bgOpacity.value = withTiming(1, { duration: T.bgIn, easing: Easing.out(Easing.quad) });

    logoOpacity.value = withDelay(T.logoDelay, withTiming(1, { duration: T.logoDuration }));
    logoScale.value = withDelay(
      T.logoDelay,
      withTiming(1, { duration: T.logoDuration, easing: Easing.out(Easing.back(1.15)) })
    );

    // Glow doré derrière le logo — pulse doucement en continu
    glowOpacity.value = withDelay(
      T.glowDelay,
      withSequence(
        withTiming(0.55, { duration: 500 }),
        withRepeat(
          withSequence(
            withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.55, { duration: 1200, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      )
    );
    glowScale.value = withDelay(
      T.glowDelay,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.96, { duration: 1400, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );

    // Reflet qui balaie le sceau une fois
    shineX.value = withDelay(
      T.shineDelay,
      withTiming(LOGO_SIZE, { duration: T.shineDuration, easing: Easing.inOut(Easing.quad) })
    );

    // Trait doré qui se dessine sous le logo
    lineWidth.value = withDelay(
      T.lineDelay,
      withTiming(1, { duration: T.lineDuration, easing: Easing.out(Easing.cubic) })
    );

    // Tagline
    taglineOpacity.value = withDelay(T.taglineDelay, withTiming(1, { duration: T.taglineDuration }));

    const timer = setTimeout(() => runOnJS(onFinish)(), duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

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

  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} pointerEvents="none">
      <LinearGradient
        colors={[NAVY_DARK, NAVY_BRAND]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        {/* Glow doré pulsé derrière le sceau */}
        <Animated.View style={[styles.glow, glowStyle]} />

        {/* Sceau EATQ.R */}
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />

          {/* ── REFLET (shine) — bloc optionnel, nécessite masked-view ── */}
          {enableShine && (
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={
                <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
              }
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
          )}
          {/* ── FIN REFLET ── */}
        </Animated.View>

        {/* Trait doré */}
        <Animated.View style={[styles.line, lineStyle]} />

        {/* Tagline */}
        <Animated.View style={taglineStyle}>
          <Animated.Text style={styles.tagline}>Commandez ensemble, en un scan</Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: LOGO_SIZE * 1.6,
    height: LOGO_SIZE * 1.6,
    borderRadius: LOGO_SIZE,
    backgroundColor: GOLD,
    opacity: 0,
    shadowColor: GOLD_LIGHT,
    shadowOpacity: 0.9,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
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
    marginTop: 22,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
