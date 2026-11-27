/**
 * Fills the global Action text page (settings/actions) with the classic Kings Cup rules
 * in every app language, plus the player-app effects (J rule, 8 mate, Q master, K cup).
 * Test data: the non-English text is a first draft and should be checked by a native speaker.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-actions.js demo-kingscup [--overwrite]
 *
 * By default only empty slots (a card in a language with no action text) are filled, so text
 * written on the dashboard is kept. Player-app effects are only added to ranks that have none.
 * --overwrite  replace everything with the defaults below.
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// [title, text] per rank, per language.
const RULES = {
  A: {
    en: ["Waterfall", "Everyone starts drinking at once. The drawer can stop any time; everyone else can only stop after the person before them stops."],
    ms: ["Air Terjun", "Semua orang minum serentak. Pencabut kad boleh berhenti bila-bila masa; orang lain hanya boleh berhenti selepas orang sebelumnya berhenti."],
    zh: ["瀑布", "所有人一起开始喝。抽牌的人可以随时停；其他人要等前一个人停了才能停。"],
    id: ["Air Terjun", "Semua minum bersamaan. Penarik kartu boleh berhenti kapan saja; yang lain hanya boleh berhenti setelah orang sebelumnya berhenti."],
    th: ["น้ำตก", "ทุกคนเริ่มดื่มพร้อมกัน คนจั่วหยุดได้ทุกเมื่อ คนอื่นหยุดได้ก็ต่อเมื่อคนก่อนหน้าหยุดแล้ว"],
    vi: ["Thác nước", "Mọi người cùng uống một lúc. Người rút bài dừng lúc nào cũng được; những người khác chỉ được dừng khi người trước mình đã dừng."],
    tl: ["Waterfall", "Sabay-sabay uminom ang lahat. Puwedeng tumigil ang bumunot kahit kailan; ang iba ay puwede lang tumigil kapag tumigil na ang nauna sa kanila."],
  },
  2: {
    en: ["You", "Pick someone to drink."],
    ms: ["Kamu", "Pilih seseorang untuk minum."],
    zh: ["你", "指定一个人喝。"],
    id: ["Kamu", "Tunjuk seseorang untuk minum."],
    th: ["คุณ", "เลือกใครสักคนให้ดื่ม"],
    vi: ["Bạn", "Chỉ định một người uống."],
    tl: ["Ikaw", "Pumili ng iinom."],
  },
  3: {
    en: ["Me", "You drink."],
    ms: ["Saya", "Kamu minum."],
    zh: ["我", "你自己喝。"],
    id: ["Aku", "Kamu minum."],
    th: ["ฉัน", "คุณดื่มเอง"],
    vi: ["Tôi", "Bạn tự uống."],
    tl: ["Ako", "Ikaw ang iinom."],
  },
  4: {
    en: ["Floor", "Everyone touches the floor. Last one to do it drinks."],
    ms: ["Lantai", "Semua sentuh lantai. Orang terakhir minum."],
    zh: ["摸地板", "所有人摸地板，最后一个摸到的喝。"],
    id: ["Lantai", "Semua menyentuh lantai. Yang terakhir minum."],
    th: ["แตะพื้น", "ทุกคนแตะพื้น คนสุดท้ายดื่ม"],
    vi: ["Chạm sàn", "Mọi người chạm tay xuống sàn. Người cuối cùng uống."],
    tl: ["Sahig", "Hawakan ng lahat ang sahig. Ang huli ang iinom."],
  },
  5: {
    en: ["Guys", "All the guys drink."],
    ms: ["Lelaki", "Semua lelaki minum."],
    zh: ["男生", "所有男生喝。"],
    id: ["Cowok", "Semua cowok minum."],
    th: ["ผู้ชาย", "ผู้ชายทุกคนดื่ม"],
    vi: ["Con trai", "Tất cả con trai uống."],
    tl: ["Lalaki", "Iinom ang lahat ng lalaki."],
  },
  6: {
    en: ["Girls", "All the girls drink."],
    ms: ["Perempuan", "Semua perempuan minum."],
    zh: ["女生", "所有女生喝。"],
    id: ["Cewek", "Semua cewek minum."],
    th: ["ผู้หญิง", "ผู้หญิงทุกคนดื่ม"],
    vi: ["Con gái", "Tất cả con gái uống."],
    tl: ["Babae", "Iinom ang lahat ng babae."],
  },
  7: {
    en: ["Heaven", "Everyone points to the sky. Last one to do it drinks."],
    ms: ["Syurga", "Semua tunjuk ke langit. Orang terakhir minum."],
    zh: ["指天", "所有人指向天空，最后一个指的喝。"],
    id: ["Surga", "Semua menunjuk ke langit. Yang terakhir minum."],
    th: ["สวรรค์", "ทุกคนชี้ขึ้นฟ้า คนสุดท้ายดื่ม"],
    vi: ["Thiên đường", "Mọi người chỉ tay lên trời. Người cuối cùng uống."],
    tl: ["Langit", "Ituro ng lahat ang langit. Ang huli ang iinom."],
  },
  8: {
    en: ["Mate", "Pick a mate. Every time you drink, they drink too, for the rest of the game."],
    ms: ["Pasangan", "Pilih pasangan. Setiap kali kamu minum, dia pun minum sehingga permainan tamat."],
    zh: ["伙伴", "选一个伙伴。直到游戏结束，你每次喝，对方也要喝。"],
    id: ["Pasangan", "Pilih pasangan. Setiap kali kamu minum, dia juga minum sampai permainan selesai."],
    th: ["คู่หู", "เลือกคู่หู ทุกครั้งที่คุณดื่ม คู่หูต้องดื่มด้วยจนจบเกม"],
    vi: ["Bạn đồng hành", "Chọn một bạn đồng hành. Mỗi lần bạn uống, người đó cũng phải uống cho đến hết game."],
    tl: ["Kapareha", "Pumili ng kapareha. Tuwing iinom ka, iinom din siya hanggang matapos ang laro."],
  },
  9: {
    en: ["Rhyme", "Say a word. Going round the circle, each player says a word that rhymes. First to repeat or get stuck drinks."],
    ms: ["Rima", "Sebut satu perkataan. Secara bergilir, setiap pemain sebut perkataan yang berima. Yang mengulang atau tersekat, minum."],
    zh: ["押韵", "说一个词，大家轮流说押韵的词。重复或接不上的人喝。"],
    id: ["Rima", "Sebut satu kata. Bergiliran, setiap pemain menyebut kata yang berima. Yang mengulang atau macet, minum."],
    th: ["คำคล้องจอง", "พูดคำหนึ่งคำ แล้วผลัดกันพูดคำที่คล้องจองกัน ใครพูดซ้ำหรือนึกไม่ออกดื่ม"],
    vi: ["Vần", "Nói một từ. Lần lượt mỗi người nói một từ cùng vần. Ai lặp lại hoặc bí thì uống."],
    tl: ["Tugma", "Magsabi ng isang salita. Salit-salitan, magsasabi ang bawat isa ng salitang katugma. Ang umulit o hindi makasagot ang iinom."],
  },
  10: {
    en: ["Categories", "Pick a category, like car brands. Going round the circle, each player names one. First to repeat or get stuck drinks."],
    ms: ["Kategori", "Pilih satu kategori, contohnya jenama kereta. Secara bergilir, setiap pemain sebut satu. Yang mengulang atau tersekat, minum."],
    zh: ["分类", "选一个类别，比如汽车品牌。大家轮流说一个。重复或说不出的人喝。"],
    id: ["Kategori", "Pilih kategori, misalnya merek mobil. Bergiliran, setiap pemain menyebut satu. Yang mengulang atau macet, minum."],
    th: ["หมวดหมู่", "เลือกหมวดหมู่ เช่น ยี่ห้อรถ แล้วผลัดกันพูดทีละคน ใครพูดซ้ำหรือนึกไม่ออกดื่ม"],
    vi: ["Chủ đề", "Chọn một chủ đề, ví dụ hãng xe hơi. Lần lượt mỗi người kể một cái. Ai lặp lại hoặc bí thì uống."],
    tl: ["Kategorya", "Pumili ng kategorya, gaya ng brand ng kotse. Salit-salitan, magsasabi ang bawat isa ng isa. Ang umulit o hindi makasagot ang iinom."],
  },
  J: {
    en: ["Make a Rule", "Make a rule everyone must follow for the rest of the game. Anyone who breaks it drinks."],
    ms: ["Buat Peraturan", "Buat satu peraturan yang semua mesti ikut sehingga permainan tamat. Sesiapa yang melanggarnya, minum."],
    zh: ["定规则", "定一条所有人都要遵守的规则，直到游戏结束。违反的人喝。"],
    id: ["Buat Aturan", "Buat satu aturan yang harus diikuti semua orang sampai permainan selesai. Yang melanggar, minum."],
    th: ["ตั้งกฎ", "ตั้งกฎหนึ่งข้อที่ทุกคนต้องทำตามจนจบเกม ใครฝ่าฝืนดื่ม"],
    vi: ["Đặt luật", "Đặt một luật mà mọi người phải theo đến hết game. Ai phạm luật thì uống."],
    tl: ["Gumawa ng Patakaran", "Gumawa ng patakarang susundin ng lahat hanggang matapos ang laro. Ang lumabag ang iinom."],
  },
  Q: {
    en: ["Question Master", "You're the Question Master until the next Queen. Anyone who answers a question you ask drinks."],
    ms: ["Ketua Soalan", "Kamu Ketua Soalan sehingga Queen seterusnya. Sesiapa yang menjawab soalan kamu, minum."],
    zh: ["提问大师", "你是提问大师，直到下一张Q出现。谁回答了你的问题，谁就喝。"],
    id: ["Master Pertanyaan", "Kamu jadi Master Pertanyaan sampai Queen berikutnya. Siapa pun yang menjawab pertanyaanmu, minum."],
    th: ["เจ้าแห่งคำถาม", "คุณเป็นเจ้าแห่งคำถามจนกว่าจะมีคนจั่วควีนใบถัดไป ใครตอบคำถามของคุณต้องดื่ม"],
    vi: ["Bậc thầy câu hỏi", "Bạn là Bậc thầy câu hỏi cho đến lá Q tiếp theo. Ai trả lời câu hỏi của bạn thì uống."],
    tl: ["Question Master", "Ikaw ang Question Master hanggang sa susunod na Queen. Sinumang sumagot sa tanong mo ay iinom."],
  },
  K: {
    en: ["King's Cup", "Pour some of your drink into the King's Cup. Whoever draws the fourth King drinks the whole cup."],
    ms: ["Cawan Raja", "Tuang sedikit minuman kamu ke dalam Cawan Raja. Siapa yang cabut King keempat, minum seluruh cawan."],
    zh: ["国王杯", "把你的酒倒一些进国王杯。抽到第四张K的人要喝光整杯。"],
    id: ["Gelas Raja", "Tuang sedikit minumanmu ke Gelas Raja. Yang menarik King keempat harus menghabiskan gelasnya."],
    th: ["แก้วราชา", "เทเครื่องดื่มของคุณลงในแก้วราชาเล็กน้อย คนที่จั่วคิงใบที่สี่ต้องดื่มทั้งแก้ว"],
    vi: ["Ly của Vua", "Rót một ít đồ uống của bạn vào Ly của Vua. Ai rút lá K thứ tư phải uống cạn cả ly."],
    tl: ["King's Cup", "Magbuhos ng kaunting inumin mo sa King's Cup. Ang makabunot ng ikaapat na King ang uubos ng buong baso."],
  },
  JOKER: {
    en: ["Never Have I Ever", "Everyone holds up 3 fingers. Take turns saying \"Never have I ever…\". Put a finger down if you have. First to lose all 3 drinks."],
    ms: ["Saya Tak Pernah", "Semua angkat 3 jari. Bergilir sebut \"Saya tak pernah…\". Turunkan satu jari jika kamu pernah. Yang pertama habis jari, minum."],
    zh: ["我从来没有", "每人举起3根手指，轮流说“我从来没有……”。做过的人放下一根手指。最先放完的人喝。"],
    id: ["Aku Belum Pernah", "Semua mengangkat 3 jari. Bergiliran bilang \"Aku belum pernah…\". Turunkan satu jari kalau kamu pernah. Yang pertama kehabisan jari, minum."],
    th: ["ฉันไม่เคย", "ทุกคนชูนิ้ว 3 นิ้ว ผลัดกันพูดว่า \"ฉันไม่เคย…\" ใครเคยทำให้พับนิ้วลงหนึ่งนิ้ว คนแรกที่นิ้วหมดดื่ม"],
    vi: ["Tôi chưa từng", "Mọi người giơ 3 ngón tay. Lần lượt nói \"Tôi chưa từng…\". Ai đã từng làm thì gập một ngón. Ai hết ngón trước thì uống."],
    tl: ["Never Have I Ever", "Magtaas ang lahat ng 3 daliri. Salit-salitang sabihin ang \"Never have I ever…\". Ibaba ang isang daliri kung nagawa mo na. Ang unang maubusan ng daliri ang iinom."],
  },
};

const EFFECTS = { J: "rule", 8: "mate", Q: "master", K: "cup" };

async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith("--"));
  if (!projectId) {
    console.error("Usage: node scripts/seed-actions.js <projectId> [--if-empty]");
    process.exit(1);
  }
  initializeApp({ projectId });
  const ref = getFirestore().collection("settings").doc("actions");

  const overwrite = args.includes("--overwrite");
  const current = (await ref.get()).data() ?? {};
  const actions = structuredClone(current.actions ?? {});
  const effects = { ...(current.effects ?? {}) };
  let filled = 0, kept = 0;

  for (const [rank, byLang] of Object.entries(RULES)) {
    for (const [lang, [title, text]] of Object.entries(byLang)) {
      if (!overwrite && actions[rank]?.[lang]?.text) { kept++; continue; }
      actions[rank] = { ...(actions[rank] ?? {}), [lang]: { title, text } };
      filled++;
    }
  }
  for (const [rank, effect] of Object.entries(EFFECTS)) if (overwrite || !effects[rank]) effects[rank] = effect;

  if (filled === 0) { console.log("Every card already has action text in every language; nothing changed."); return; }
  await ref.set({ actions, effects, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`Filled ${filled} empty card/language slots${kept ? `, kept ${kept} you had already written` : ""}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
