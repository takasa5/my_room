// 部屋の家具 ⇔ Notion ページの対応表。
// 将来 Notion から同期する場合は、このファイルをバッチで生成し直せばよい。
window.ROOM_DATA = {
  title: "My Room",
  top: "https://abstracted-lancer-5f0.notion.site/ee7345238d91474d9cd093b9b24f0fea",
  items: {
    photo: {
      furniture: "写真立て",
      title: "🌇 All About Me",
      links: [{ label: "All About Me", url: "https://abstracted-lancer-5f0.notion.site/ee7345238d91474d9cd093b9b24f0fea" }]
    },
    books: {
      furniture: "本",
      title: "📚 Books",
      links: [
        { label: "Books", url: "https://abstracted-lancer-5f0.notion.site/1d08baf3c04b80209612c2bc34b493f0" }
      ]
    },
    audio: {
      furniture: "ヘッドホンとスピーカー",
      title: "🎧 Music",
      links: [
        { label: "Music", url: "https://abstracted-lancer-5f0.notion.site/1d08baf3c04b80c687eae831b0f5fe2a" }
      ],
      // パネルに出す「最近聴いた曲」（last.fm）
      image: "https://lastfm-recently-played.jeffreyca.workers.dev/svg?user=tixino&theme=nord&width=450&username=0&stats=compact&footer=wave",
      imageLink: "https://www.last.fm/user/tixino"   // 画像を押すと開くページ
    },
    papers: {
      furniture: "紙の束",
      title: "📮 Posts",
      links: [{ label: "Posts", url: "https://abstracted-lancer-5f0.notion.site/eb09df3ad61a4adea8765eea005cacbe" }]
    },
    mug: {
      furniture: "マグカップ",
      title: "💕 Likes / Dislikes",
      links: [{ label: "Likes / Dislikes", url: "https://abstracted-lancer-5f0.notion.site/d03f9de4fd3e4ef0b05da36c76c9f64e" }]
    },
    plant: {
      furniture: "窓辺の芽",
      title: "🌱 Pre-favorites",
      links: [{ label: "Pre-favorites", url: "https://abstracted-lancer-5f0.notion.site/0b20df18ff114232a006c593f3b85fff" }]
    },
    console: {
      furniture: "携帯ゲーム機",
      title: "🎮 Games",
      links: [{ label: "Games", url: "https://abstracted-lancer-5f0.notion.site/b90f257a35244fa2bbb64ab8977486cd" }]
    },
    calendar: {
      furniture: "カレンダー",
      title: "📜 History",
      links: [{ label: "History", url: "https://abstracted-lancer-5f0.notion.site/59ed737f5c9a4f10926634551374438f" }]
    },
    poster: {
      furniture: "映画のポスター",
      title: "🎬 Movie",
      links: [{ label: "Movie", url: "https://abstracted-lancer-5f0.notion.site/9ab4d8a8b82f454ebe987e7d19c9bf75" }]
    },
    computer: {
      furniture: "パソコン",
      title: "💻 Developments",
      links: [{ label: "Developments", url: "https://abstracted-lancer-5f0.notion.site/1db9e26d46c6417da13ade7ddeca6691" }]
    },
    diary: {
      furniture: "日記帳",
      title: "📓 Paper Diary",
      links: [{ label: "Paper Diary", url: "https://abstracted-lancer-5f0.notion.site/18d8baf3c04b8062841fca772ac82592" }]
    },
    poker: {
      furniture: "チップとカード",
      title: "🃏 Poker",
      links: [{ label: "Poker", url: "https://abstracted-lancer-5f0.notion.site/18e8baf3c04b80279dc1d5aea7c3518a" }]
    }
  }
};
