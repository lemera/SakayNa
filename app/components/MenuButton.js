import React, { useRef } from "react";
import {
  Animated,
  StyleSheet,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const BUTTON_SIZE = 60;

export default function MenuButton({ onPress }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const initialBottom = insets.bottom + (height > 800 ? 90 : 70);
  const initialX = width - 20 - BUTTON_SIZE;
  const initialY = height - initialBottom - BUTTON_SIZE;

  // JS-driven: controls top/left — useNativeDriver must be FALSE
  const position = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const lastPosition = useRef({ x: initialX, y: initialY });

  // Native-driven: controls scale only — useNativeDriver must be TRUE
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const hasMoved = useRef(false);
  const dragStartTime = useRef(0);

  const snapToEdge = (x, y) => {
    const snapX =
      x + BUTTON_SIZE / 2 < width / 2 ? 16 : width - BUTTON_SIZE - 16;

    const clampedY = Math.max(
      insets.top + 16,
      Math.min(y, height - BUTTON_SIZE - insets.bottom - 16)
    );

    Animated.spring(position, {
      toValue: { x: snapX, y: clampedY },
      useNativeDriver: false,
      friction: 7,
      tension: 50,
    }).start();

    lastPosition.current = { x: snapX, y: clampedY };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,

      onPanResponderGrant: () => {
        dragStartTime.current = Date.now();
        hasMoved.current = false;

        position.setOffset({
          x: lastPosition.current.x,
          y: lastPosition.current.y,
        });
        position.setValue({ x: 0, y: 0 });

        Animated.spring(scaleAnim, {
          toValue: 0.88,
          useNativeDriver: true,
          speed: 50,
        }).start();
      },

      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) {
          hasMoved.current = true;
        }
        position.setValue({ x: g.dx, y: g.dy });
      },

      onPanResponderRelease: (_, g) => {
        position.flattenOffset();

        const elapsed = Date.now() - dragStartTime.current;
        const moved = hasMoved.current;

        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
        }).start();

        if (!moved && elapsed < 300) {
          // It was a tap — fire onPress without snapping
          onPress && onPress();
        } else {
          // It was a drag — snap to nearest edge
          const finalX = lastPosition.current.x + g.dx;
          const finalY = lastPosition.current.y + g.dy;
          snapToEdge(finalX, finalY);
        }

        hasMoved.current = false;
      },
    })
  ).current;

  return (
    // Outer Animated.View: JS-driven position (left/top) — useNativeDriver: false
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          left: position.x,
          top: position.y,
        },
      ]}
    >
      {/* Inner Animated.View: native-driven scale — useNativeDriver: true */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <LinearGradient
          colors={["#FF6B4A", "#FF8A5C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          <Ionicons name="menu" size={28} color="#FFF" />
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    zIndex: 999,
    shadowColor: "#FF6B4A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
  },
});