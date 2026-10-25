export type FeedClip = {
  id: string;
  videoUrl: string;
  thumbnail: string;
  caption: string;
  hashtags: string[];
  audioTrack: string;
  creator: { handle: string; avatarUrl: string };
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  booking: { tag: string; name: string; price: number };
};

// Mock ชั่วคราว — เฟส 2 มีคลิปจริงค่อยเปลี่ยนใส้ในนี้ไป query DB
// response shape ล็อกไว้แล้ว front ไม่ต้องแก้
const MOCK_CLIPS: FeedClip[] = [
  {
    id: "c1",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnail: "",
    caption: "Unreal morning view at Chiang Mai hidden sanctuary...",
    hashtags: ["#chiangmai", "#travelguide"],
    audioTrack: "Ambient Morning Lounge",
    creator: { handle: "@wanderer_ploy", avatarUrl: "" },
    likes: 48200,
    saves: 8910,
    shares: 3400,
    comments: 1240,
    booking: { tag: "STAY", name: "Anantara Chiang Mai", price: 4750 },
  },
  {
    id: "c2",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    thumbnail: "",
    caption: "Island hopping day — Maya Bay at golden hour",
    hashtags: ["#phuket", "#islandtrip"],
    audioTrack: "Summer Waves Mix",
    creator: { handle: "@chiangmai_dan", avatarUrl: "" },
    likes: 21500,
    saves: 4300,
    shares: 1800,
    comments: 640,
    booking: { tag: "TOUR", name: "Phi Phi Speedboat Tour", price: 1890 },
  },
];

export function getFeedClips(cursor?: string, take = 5) {
  const start = cursor ? MOCK_CLIPS.findIndex((clip) => clip.id === cursor) + 1 : 0;
  const items = MOCK_CLIPS.slice(start, start + take);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last && start + take < MOCK_CLIPS.length ? last.id : null,
  };
}
