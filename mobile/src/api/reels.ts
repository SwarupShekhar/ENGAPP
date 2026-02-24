import { client } from "./client";

export interface ReelActivity {
  type: "mcq" | "fill_blank";
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic_tag: string;
}

export interface Reel {
  id: string;
  title: string;
  playback_url: string;
  topic_tag: string;
  activity: ReelActivity | null;
}

export const reelsApi = {
  getFeed: async (): Promise<Reel[]> => {
    const response = await client.get("/reels/feed");
    return response.data;
  },
  submitActivityResult: async (
    reelId: string,
    isCorrect: boolean,
    topicTag: string,
  ): Promise<any> => {
    const response = await client.post("/reels/activity/submit", {
      reelId,
      isCorrect,
      topicTag,
    });
    return response.data;
  },
};
