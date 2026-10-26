// seed.js — sample inspirations including the coffee-machine case, with cross-links
import * as db from './db.js';

const NOW = Date.now();
const DAY = 86400000;

const samples = [
  {
    title: '那台墨绿色的咖啡机',
    saw: '路过一家复古杂货铺，角落摆着一台墨绿色意式咖啡机，铜质手柄被磨得发亮，旁边搁着一只缺了角的杯子。',
    thoughts: '那台机器像是有故事的人留下的。墨绿配铜，质感很沉。我立刻想到林深——他家吧台上会不会也放一台？[[雨天的便利店灯光]]里那个他，会真的喝咖啡吗？',
    story: '林深其实不太喝咖啡，但他在吧台上摆了一台墨绿色的 La Marzocco，纯为氛围。每个来他家的人都以为他是行家，只有苏野知道他每次都得偷偷查“怎么打奶泡”。某个下雨的下午，苏野撞见他对着机器发呆，两人谁也没说话，雨声把屋子填满了。后来那台机器常在 [[深夜厨房的一盏暖灯]] 里沉默着，像个不肯走的客人。它和白噪音一起，构成了 [[老式收音机的白噪音]] 里那种“在等什么”的屋子。',
    ocs: ['林深', '苏野'],
    collection: '器物与场景',
    tags: ['氛围感', '厨房', '友谊'],
    img: true,
    ago: 5 * DAY,
  },
  {
    title: '雨天的便利店灯光',
    saw: '深夜便利店，玻璃被雨水糊住，里面透出那种很亮、偏蓝的白光，门口风铃被风带得叮一声。',
    thoughts: '那种光是冷的、孤独的，但又是安全的。林深下班常走这条街，他会在门口站一会儿再进去。和 [[那台墨绿色的咖啡机]] 的暖光正好是两个世界。',
    story: '林深在便利店买了一罐热可可，没买咖啡——虽然家里有咖啡机。他想：机器是给客人看的，可可才是给自己的。结账时店员递来多一张纸巾，他没拒绝。出门时雨小了，他绕了远路回家。',
    ocs: ['林深'],
    collection: '光与情绪',
    tags: ['雨', '夜晚', '孤独'],
    ago: 4 * DAY,
  },
  {
    title: '老式收音机的白噪音',
    saw: '旧货市场一台木质收音机，旋钮是象牙色的，拧开只有沙沙声，店主说“能响，就是没台”。',
    thoughts: '苏野会喜欢这个。他房间里什么都不要，就要这种有“时间感”的声音。它和 [[那台墨绿色的咖啡机]] 一起，会让林深那间屋子变成另一个地方。',
    story: '苏野把收音机搬回家，不调台，只听白噪音。林深来访时说：“你这屋子像在等什么人。” 苏野说：“在等雨。” 后来收音机搬去了林深家，和咖啡机并排——一个负责气味，一个负责声音。',
    ocs: ['苏野', '林深'],
    collection: '声音',
    tags: ['旧物', '白噪音', '等待'],
    ago: 3 * DAY,
  },
  {
    title: '爬满藤蔓的旧阳台',
    saw: '老小区六楼，一整面墙的爬山虎，秋天变红，有几根已经探进了邻居没关的窗。',
    thoughts: '这是阿柠会住的地方。她喜欢那种“被植物慢慢吃掉”的感觉。',
    story: '阿柠在阳台上养了二十多盆，最后分不清哪盆是哪盆。她说植物不需要名字，只需要阳光和她偶尔忘记的浇水。某天藤蔓爬进了邻居窗户，邻居没剪，反而浇了水。',
    ocs: ['阿柠'],
    collection: '器物与场景',
    tags: ['植物', '阳台', '生长'],
    ago: 2 * DAY,
  },
  {
    title: '故意走慢三分钟的座钟',
    saw: '朋友家玄关一座老座钟，比标准时间慢三分钟，朋友说“故意的，这样不焦虑”。',
    thoughts: '故意慢三分钟——这是某种生活态度。林深一定懂。它该和 [[老式收音机的白噪音]] 放同一个玄关。',
    story: '林深的座钟也慢三分钟。他说：“这样我永远比别人早到一点点，心理上。” 苏野说这是自欺。阿柠说这是温柔。三个人为此争了一整个晚上，最后谁也没改钟。',
    ocs: ['林深', '苏野', '阿柠'],
    collection: '器物与场景',
    tags: ['时间', '玄关'],
    ago: 1 * DAY,
  },
  {
    title: '深夜厨房的一盏暖灯',
    saw: '自己家厨房，凌晨两点，只开灶台上方那盏小灯，其余都暗着。',
    thoughts: '这种光是私密的，只属于一个人醒着的时刻。我想给林深这个场景，让他和 [[那台墨绿色的咖啡机]] 在暗处对峙。',
    story: '林深会在这种时刻热一杯牛奶（不是咖啡）。咖啡机在暗处像个沉默的客人。他想：白天那台机器是演给别人看的，现在这盏灯才是真的自己。窗外偶尔有车经过，光扫过天花板，又走。',
    ocs: ['林深'],
    collection: '光与情绪',
    tags: ['厨房', '夜晚', '独处'],
    ago: 2 * 3600000,
  },
];

function coffeeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#33412c"/><stop offset="1" stop-color="#5f7d43"/>
    </linearGradient>
    <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f5d52"/><stop offset="1" stop-color="#1d3d36"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/>
  <rect x="210" y="150" width="220" height="170" rx="22" fill="url(#m)"/>
  <rect x="210" y="150" width="220" height="40" rx="22" fill="#255049"/>
  <circle cx="320" cy="235" r="30" fill="#c98a4b"/>
  <circle cx="320" cy="235" r="18" fill="#3a2a1a"/>
  <rect x="430" y="200" width="46" height="60" rx="14" fill="none" stroke="#c98a4b" stroke-width="7"/>
  <rect x="250" y="320" width="140" height="22" rx="8" fill="#caa15a"/>
  <line x1="300" y1="120" x2="296" y2="150" stroke="#e8e3d2" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
  <line x1="320" y1="110" x2="320" y2="150" stroke="#e8e3d2" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <line x1="340" y1="120" x2="344" y2="150" stroke="#e8e3d2" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
  <text x="320" y="372" font-family="serif" font-size="20" fill="#e8e3d2" text-anchor="middle" opacity="0.8">La Marzocco · 墨绿</text>
</svg>`;
}

export async function seedAll() {
  const seeded = await db.getMeta('seeded', false);
  if (seeded) return;

  const coffeeImgId = db.uuid();
  try {
    await db.putImage(coffeeImgId, new Blob([coffeeSvg()], { type: 'image/svg+xml' }));
  } catch (_) { /* image optional */ }

  for (const s of samples) {
    await db.saveInspiration({
      id: db.uuid(),
      title: s.title,
      saw: s.saw,
      imageId: s.img ? coffeeImgId : undefined,
      thoughts: s.thoughts,
      story: s.story,
      ocs: s.ocs,
      collection: s.collection,
      tags: s.tags,
      createdAt: NOW - s.ago,
      updatedAt: NOW - s.ago,
    });
  }
  await db.setMeta('seeded', true);
}
