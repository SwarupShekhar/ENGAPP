import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import {
  useNavigation,
  useRoute,
  RouteProp,
  NavigationProp,
} from "@react-navigation/native";
import type { RootStackParamList } from "../../../navigation/RootNavigator";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { reelsApi } from "../../../api/reels";
import { useAppTheme } from "../../../theme/useAppTheme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ReelViewerScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "ReelViewer">>();
  const { reelId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    reelsApi
      .getById(reelId)
      .then((reel) => {
        if (!mounted) return;
        setTitle(reel.title);
        setVideoUrl(reel.playback_url);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setError("This reel is no longer available.");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reelId]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color="#FFF" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error || !videoUrl ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || "Unable to load reel"}</Text>
        </View>
      ) : (
        <>
          <Video
            source={{ uri: videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            useNativeControls={false}
          />
          <View style={styles.titleBar}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
  },
  titleBar: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
  },
  title: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
