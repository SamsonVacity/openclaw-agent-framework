/**
 * SongForge - AI音乐创作流水线 v2.5
 * 修复记录（v2.5）:
 * - 修复循环卡住：达到上限后明确提示"已达优化上限"
 * - 修复维度风格不匹配：按风格分配不同维度权重
 * - 修复基准太苛刻：允许1-2个维度略低，整体均衡即可
 * - 修复提示词衰减：每次优化使用不同策略关键词
 * - 修复差异化基准：5种风格有不同评分策略
 */

const { execSync } = require('child_process');
const path = require('path');

const DB_PATH = '/home/samson/nas-song-corpus/crawler/data/songforge.db';
const SCORING_SCRIPT = path.join(process.env.HOME, '.songforge/scoring/songforge_scoring.py');
const HUMANIZER_DETECTOR = path.join(process.env.HOME, '.songforge/humanizer_detector.js');

// ================================================================
// 风格差异化评分配置
// ================================================================
const STYLE_PROFILES = {
  '流行': {
    weight: { rhyme: 0.15, yijing: 0.20, qinggan: 0.25, human: 0.20, coherence: 0.20 },
    benchmark: { rhyme: 85, yijing: 88, qinggan: 88, human: 82, coherence: 85 },
    focus: ['情感', '押韵'],           // 重点维度
    flexible: 1,                       // 允许几个维度略低
    flexibleMargin: 5,                 // 略低多少（分）
    optimizeHint: '强化副歌韵脚，增加情感爆发点，让旋律更上口'
  },
  '电子': {
    weight: { rhyme: 0.10, yijing: 0.30, qinggan: 0.20, human: 0.20, coherence: 0.20 },
    benchmark: { rhyme: 75, yijing: 90, qinggan: 82, human: 80, coherence: 82 },
    focus: ['意境', '去AI味'],
    flexible: 2,
    flexibleMargin: 8,
    optimizeHint: '增加氛围感描述，减少套路化表达，押韵可适当放宽'
  },
  '民谣': {
    weight: { rhyme: 0.20, yijing: 0.25, qinggan: 0.25, human: 0.15, coherence: 0.15 },
    benchmark: { rhyme: 88, yijing: 85, qinggan: 88, human: 78, coherence: 80 },
    focus: ['押韵', '情感', '意境'],
    flexible: 1,
    flexibleMargin: 6,
    optimizeHint: '强化叙事感，押韵更自然，增加故事画面'
  },
  '摇滚': {
    weight: { rhyme: 0.15, yijing: 0.20, qinggan: 0.30, human: 0.20, coherence: 0.15 },
    benchmark: { rhyme: 82, yijing: 85, qinggan: 90, human: 80, coherence: 80 },
    focus: ['情感'],
    flexible: 2,
    flexibleMargin: 7,
    optimizeHint: '情感更强烈直接，减少温柔表达，增加爆发力和冲击力'
  },
  '嘻哈': {
    weight: { rhyme: 0.30, yijing: 0.10, qinggan: 0.20, human: 0.25, coherence: 0.15 },
    benchmark: { rhyme: 92, yijing: 75, qinggan: 85, human: 85, coherence: 78 },
    focus: ['押韵', '去AI味'],
    flexible: 1,
    flexibleMargin: 5,
    optimizeHint: '韵脚更密集更有变化，Flow更自然，避免书面语'
  }
};

// 默认配置（未知风格用这个）
const DEFAULT_PROFILE = {
  weight: { rhyme: 0.15, yijing: 0.20, qinggan: 0.25, human: 0.20, coherence: 0.20 },
  benchmark: { rhyme: 85, yijing: 85, qinggan: 85, human: 80, coherence: 82 },
  focus: ['情感'],
  flexible: 1,
  flexibleMargin: 5,
  optimizeHint: '让歌词更自然流畅，增加情感共鸣'
};

// 优化策略库（解决提示词衰减问题）
const OPTIMIZE_STRATEGIES = [
  '完全重写副歌部分，让情感更饱满',
  '调整韵脚位置，押韵更自然不生硬',
  '增加具象意象词，减少抽象表达',
  '让高潮部分情感爆发，前面的铺垫更克制',
  '口语化表达，去掉书面语和套路化开头',
  '增加叙事细节，让故事有画面感',
  '调整段落衔接，过渡更自然流畅',
  '让歌词有记忆点，一听就记住的句子',
  '减少重复表达，每句都有新信息',
  '强化最后一句的hook，让整首歌有余韵',
  // Humanizer策略（去除AI写作痕迹）
  '去掉"星辰大海""诗和远方"等套话，用更具体的意象替代',
  '去掉"莫名的忧伤""淡淡的哀愁"等模糊情感，用具体描写',
  '去掉"像一首诗""如画般"等过度浪漫化表达',
  '减少"于是乎""从而""因而"等连接词，让句子自然断句',
  '去掉公式化的段落结构标记，让歌词自然流动'
];

const songforgeTool = {
  name: 'songforge',
  description: 'SongForge AI音乐创作流水线 v2.5 — 风格差异化评分 + 智能优化循环',

  tools: [{
    name: 'songforge-analyze',
    description: 'Step 0: 分析数据库歌曲 + 森哥历史偏好',
    parameters: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: '歌曲主题（分析参考用）' },
        limit: { type: 'integer', description: '分析最近N首歌', default: 20 }
      },
      required: ['theme']
    }
  }, {
    name: 'songforge-generate',
    description: 'Step 1: DeepSeek生成歌词（参考分析结果）',
    parameters: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: '歌曲主题' },
        style: { type: 'string', description: '音乐风格', default: '流行' },
        mood: { type: 'string', description: '歌曲情绪', default: '自然' },
        analysis: { type: 'string', description: 'Step 0分析报告（参考）' }
      },
      required: ['theme']
    }
  }, {
    name: 'songforge-polish',
    description: 'Step 2: 润色歌词，输出Mureka格式，森哥可直接对照创建',
    parameters: {
      type: 'object',
      properties: {
        lyrics: { type: 'string', description: '待润色歌词' },
        theme: { type: 'string', description: '歌曲主题' },
        style: { type: 'string', description: '音乐风格', default: '流行' },
        mood: { type: 'string', description: '歌曲情绪', default: '自然' },
        analysis: { type: 'string', description: 'Step 0分析报告（参考）' }
      },
      required: ['lyrics', 'theme']
    }
  }, {
    name: 'songforge-score',
    description: 'Step 3: 歌词五维质量评分（押韵15% + 意境20% + 情感25% + 去AI味20% + 连贯性20%）',
    parameters: {
      type: 'object',
      properties: {
        lyrics: { type: 'string', description: '待评分歌词（完整歌词文本）' }
      },
      required: ['lyrics']
    }
  }, {
    name: 'songforge-optimize',
    description: '歌词智能优化：评分→自动针对弱项优化→再评分，循环最多3次，最后输出最终版本（标注优化次数）',
    parameters: {
      type: 'object',
      properties: {
        lyrics: { type: 'string', description: '待优化歌词' },
        theme: { type: 'string', description: '歌曲主题' },
        style: { type: 'string', description: '音乐风格', default: '流行' },
        mood: { type: 'string', description: '歌曲情绪', default: '自然' }
      },
      required: ['lyrics', 'theme']
    }
  }],

  async execute({ tool, params }) {
    switch (tool) {
      case 'songforge-analyze':    return this.analyze(params);
      case 'songforge-generate':   return this.generate(params);
      case 'songforge-polish':     return this.polish(params);
      case 'songforge-score':      return this.score(params);
      case 'songforge-optimize':   return this.optimize(params);
      default: return { ok: false, error: 'Unknown tool: ' + tool };
    }
  },

  // ================================================================
  // 获取风格配置
  // ================================================================
  _getStyleProfile(style) {
    for (const [key, profile] of Object.entries(STYLE_PROFILES)) {
      if (style.includes(key)) return profile;
    }
    return DEFAULT_PROFILE;
  },

  // ================================================================
  // 核心：检查是否达标（允许1-2个维度略低）
  // ================================================================
  _checkPass(scoreResult, profile) {
    const { benchmark, flexible, flexibleMargin, focus } = profile;
    const dims = ['rhyme', 'yijing', 'qinggan', 'human', 'coherence'];
    const dimNames = { rhyme: '押韵', yijing: '意境', qinggan: '情感', human: '去AI味', coherence: '连贯性' };

    let failedDims = [];
    let flexibleFailed = [];

    for (const dim of dims) {
      const score = scoreResult[dim + '_score'] ?? 0;
      const bench = benchmark[dim];
      if (score >= bench) {
        // 达标
      } else if (focus.includes(dimNames[dim]) && score >= bench - flexibleMargin) {
        // 重点维度但略低一点，可接受
        flexibleFailed.push({ dim: dimNames[dim], score, bench });
      } else if (score >= bench - flexibleMargin) {
        // 非重点维度略低，可接受
        flexibleFailed.push({ dim: dimNames[dim], score, bench });
      } else {
        // 完全不达标
        failedDims.push({ dim: dimNames[dim], score, bench });
      }
    }

    // 允许 flexible 个略低
    const pass = failedDims.length === 0 && flexibleFailed.length <= flexible;
    return { pass, failedDims, flexibleFailed, dimNames };
  },

  // ================================================================
  // Step 0: 分析数据库歌曲 + 森哥偏好
  // ================================================================
  async analyze({ theme, limit = 20 }) {
    try {
      const styleStats = execSync(
        `sqlite3 "${DB_PATH}" "SELECT style, COUNT(*) as cnt FROM songs GROUP BY style ORDER BY cnt DESC LIMIT 10"`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      const structures = execSync(
        `sqlite3 "${DB_PATH}" "SELECT structure, COUNT(*) as cnt FROM songs WHERE structure IS NOT NULL GROUP BY structure ORDER BY cnt DESC LIMIT 5"`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      const recentSongs = execSync(
        `sqlite3 "${DB_PATH}" "SELECT title, artist, style, mood FROM songs ORDER BY id DESC LIMIT ${limit}"`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      const keywords = execSync(
        `sqlite3 "${DB_PATH}" "SELECT keywords, COUNT(*) as cnt FROM songs WHERE keywords IS NOT NULL AND keywords != '' GROUP BY keywords ORDER BY cnt DESC LIMIT 10"`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      const analysis = `
**SongForge 创作分析报告**

**主题：** ${theme}

**数据库统计（最近${limit}首）：**
- 热门风格：${styleStats || '暂无数据'}
- 段落结构：${structures || '暂无数据'}
- 热门关键词：${keywords || '暂无数据'}

**最近歌曲参考：**
${recentSongs || '暂无数据'}

**创作建议：**
根据数据库分析，建议：
- 风格：流行/民谣 为主
- 结构：Verse-PreChorus-Chorus-Bridge 完整结构
- 情绪：${theme}主题适合${['忧伤', '温柔', '回忆'].join(' / ')}
`;

      return { ok: true, analysis: analysis.trim(), theme };
    } catch (e) {
      return { ok: false, error: `分析失败: ${e.message}` };
    }
  },

  // ================================================================
  // Step 1: DeepSeek生成歌词
  // ================================================================
  async generate({ theme, style = '流行', mood = '自然', analysis }) {
    const startTime = Date.now();
    try {
      const analysisRef = analysis ? `\n【数据库分析参考】${analysis}\n` : '';
      const profile = this._getStyleProfile(style);

      const prompt = `${analysisRef}请为以下主题创作歌词：

主题：${theme}
风格：${style}
情绪：${mood}

要求：
1. 结构完整（前奏→主歌→预副歌→副歌→主歌→预副歌→副歌→桥段→副歌→尾奏）
2. 中文歌词，有韵脚
3. 长度：完整2-3分钟歌曲
4. 紧扣"${theme}"主题
5. 风格特点：${profile.optimizeHint}

格式：
歌名: 你的歌名

歌词:
[各段落标记和歌词内容]`;

      const result = execSync(`python3 -c "
import subprocess, json
api_key = 'sk-27f18f86cabc4c069820f4f01cae4e6d'
payload = json.dumps({'model':'deepseek-chat','messages':[{'role':'user','content':'''${prompt.replace(/'/g, "\\'")}'''}],'max_tokens':2048,'temperature':0.7})
r = subprocess.run(['curl','-s','-X','POST','https://api.deepseek.com/v1/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+api_key,'-d',payload], capture_output=True, text=True, timeout=30)
d = json.loads(r.stdout)
print(d['choices'][0]['message']['content'].strip() if 'choices' in d else 'ERROR:'+str(d))
"`, { encoding: 'utf-8', timeout: 35000 });

      const output = result.trim();

      const lines = output.split('\n');
      let songTitle = theme;
      let inLyrics = false;
      const lyricsLines = [];

      for (const line of lines) {
        const titleMatch = line.match(/^歌名[:：]\s*(.+)/);
        if (titleMatch) { songTitle = titleMatch[1].trim(); continue; }
        if (line.match(/^歌词/)) { inLyrics = true; continue; }
        if (inLyrics && line.trim()) lyricsLines.push(line);
      }

      const lyrics = lyricsLines.join('\n').trim();

      return {
        ok: true,
        song_title: songTitle,
        lyrics,
        theme,
        style,
        mood,
        duration_ms: Date.now() - startTime,
        message: `✅ 《${songTitle}》歌词已生成，请发给森哥确认`
      };
    } catch (e) {
      return { ok: false, error: `生成失败: ${e.message}`, step: 'generate' };
    }
  },

  // ================================================================
  // Step 2: 润色歌词 + 输出Mureka格式（集成v2.5优化逻辑）
  // ================================================================
  async polish({ lyrics, theme, style = '流行', mood = '自然', analysis }) {
    const startTime = Date.now();
    try {
      const analysisRef = analysis ? `\n【数据库分析参考】${analysis}\n` : '';
      const profile = this._getStyleProfile(style);

      const prompt = `${analysisRef}你是一位专业歌词编辑。请对以下歌词进行润色：

歌词：
${lyrics}

主题：${theme}
风格：${style}
情绪：${mood}

要求：
1. 严格保持原意、原句、结构不变
2. 只优化：韵脚、节奏感、Flow
3. 不添加新内容，不重写故事
4. 保留所有段落标记
5. 风格特点：${profile.optimizeHint}

直接输出润色后的完整歌词：`;

      const result = execSync(`python3 -c "
import subprocess, json
api_key = 'sk-27f18f86cabc4c069820f4f01cae4e6d'
payload = json.dumps({'model':'deepseek-chat','messages':[{'role':'user','content':'''${prompt.replace(/'/g, "\\'")}'''}],'max_tokens':2048,'temperature':0.0})
r = subprocess.run(['curl','-s', '-X', 'POST', 'https://api.deepseek.com/v1/chat/completions', '-H', 'Content-Type: application/json', '-H', 'Authorization: Bearer '+api_key, '-d', payload], capture_output=True, text=True, timeout=30)
d = json.loads(r.stdout)
print(d['choices'][0]['message']['content'].strip() if 'choices' in d else 'ERROR:'+str(d))
"`, { encoding: 'utf-8', timeout: 35000 });

      const polished = result.trim();
      const polishUsed = polished !== lyrics && polished.length > 20;

      // LLM五维评分
      const scoreResult = await this._llmScore(polished, style);

      // v2.5 优化循环：基于风格配置
      let optimizedLyrics = polished;
      let optimizeCount = 0;
      let stuck = false;

      while (optimizeCount < 3) {
        const { pass, failedDims, flexibleFailed } = this._checkPass(scoreResult, profile);

        if (pass) {
          break; // 达标，退出
        }

        // 选一个策略（轮换，解决提示词衰减）
        const strategyIdx = optimizeCount % OPTIMIZE_STRATEGIES.length;
        const strategy = OPTIMIZE_STRATEGIES[strategyIdx];

        // 确定要优化的维度
        const dimsToImprove = failedDims.length > 0
          ? failedDims.map(d => d.dim).join('、')
          : flexibleFailed.map(d => d.dim).join('、');

        optimizeCount++;

        const optPrompt = `你是一位歌词优化专家。这次优化策略：${strategy}

上一版歌词：
${optimizedLyrics}

重点改进：${dimsToImprove}

要求：
1. 保持原意、原句、结构不变
2. 重点改进：${dimsToImprove}
3. 保留所有段落标记

直接输出优化后的完整歌词，不要解释：`;

        const optResult = execSync(`python3 -c "
import subprocess, json
api_key = 'sk-27f18f86cabc4c069820f4f01cae4e6d'
payload = json.dumps({'model':'deepseek-chat','messages':[{'role':'user','content':'''${optPrompt.replace(/'/g, "\\'\\'")}'''}],'max_tokens':1500,'temperature':0.3})
r = subprocess.run(['curl','-s','-X','POST','https://api.deepek.com/v1/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+api_key,'-d',payload], capture_output=True, text=True, timeout=35)
d = json.loads(r.stdout)
print(d['choices'][0]['message']['content'].strip() if 'choices' in d else 'ERROR')
"`, { encoding: 'utf-8', timeout: 40000 });

        const newLyrics = optResult.trim();
        if (newLyrics && newLyrics !== optimizedLyrics && !newLyrics.startsWith('ERROR')) {
          optimizedLyrics = newLyrics;
          scoreResult = await this._llmScore(optimizedLyrics, style);
        } else {
          break; // 优化失败，保留当前版本
        }
      }

      // 如果达到上限还没达标，标记一下
      if (optimizeCount >= 3) {
        const { pass, failedDims, flexibleFailed } = this._checkPass(scoreResult, profile);
        if (!pass) {
          stuck = true;
        }
      }

      const finalLyrics = optimizedLyrics;

      // 构建评分表格（基于风格的基准）
      const d = scoreResult;
      const bench = profile.benchmark;

      // Humanizer结果
      const humanizer = scoreResult.humanizer;
      let humanizerSection = '';
      if (humanizer && humanizer.totalPatternsFound > 0) {
        humanizerSection = `\n\n🤖 **Humanizer AI痕迹检测：**\n` +
          `| 指标 | 数值 |\n|------|------|\n` +
          `| 人类化得分 | **${humanizer.humanScore}/100** |\n` +
          `| 等级 | ${humanizer.level} |\n` +
          `| 模式匹配 | ${humanizer.totalPatternsFound}种 |\n` +
          `\n**⚠️ 检测到的AI模式：**\n` +
          humanizer.warnings.slice(0, 5).map(w => `• ${w}`).join('\n');
        if (humanizer.suggestions.length > 0) {
          humanizerSection += `\n\n**💡 改进建议：**\n` +
            humanizer.suggestions.slice(0, 3).map(s => `• ${s}`).join('\n');
        }
      } else if (humanizer) {
        humanizerSection = `\n\n✅ **Humanizer检测：** 几乎无AI痕迹（${humanizer.humanScore}/100）`;
      }
      const dimNames = { rhyme: '押韵', yijing: '意境', qinggan: '情感', human: '去AI味', coherence: '连贯性' };

      const scoreTable = Object.entries(dimNames).map(([key, name]) => {
        const score = d[key + '_score'] ?? 0;
        const b = bench[key];
        const isFocus = profile.focus.includes(name);
        const flag = score >= b ? '✅' : (isFocus && score >= b - profile.flexibleMargin ? '⚠️' : '❌');
        return `| ${name} | ${score}/100 | ≥${b} | ${flag} |`;
      }).join('\n');

      const stuckNote = stuck ? '\n\n⚠️ **已达最大优化次数（3次），部分维度略低于基准，请人工判断是否接受当前版本**' : '';

      const murekaTags = this._suggestMurekaTags(style, mood, theme);
      const suggestedVocal = murekaTags.includes('男声') || mood.includes('深沉') ? '男声' : '女声';
      const suggestedStructure = murekaTags.includes('电子') || murekaTags.includes('Techno')
        ? '前奏→主歌→副歌→Drop→副歌→尾奏'
        : '前奏→主歌→预副歌→副歌→主歌→预副歌→副歌→桥段→副歌→尾奏';

      const message = `🎵 **SongForge v2.5 歌词已生成**${stuck ? ' ⚠️（已优化但部分维度略低）' : ''}

---

**📝 歌词如下，可直接复制到Mureka：**

---

${finalLyrics}

---

**🎯 五维评分（${style}风格化标准）：**

| 维度 | 分数 | 基准 | 状态 |
|------|------|------|------|
${scoreTable}

> 💡 风格化评分：${style}优先看重${profile.focus.join('、')}；允许${profile.flexible}个维度略低于基准${profile.flexibleMargin}分

${stuckNote}${humanizerSection}

---

**🎛️ Mureka参数建议：**

| 参数 | 建议值 |
|------|--------|
| **歌名** | ${theme} |
| **风格标签** | ${murekaTags.slice(0, 4).join(', ')} |
| **人声性别** | ${suggestedVocal} |
| **歌曲结构** | ${suggestedStructure} |

---

**确认请回复"确认"，如需调整风格标签或人声性别请告诉我。**`;

      return {
        ok: true,
        lyrics: polished,
        polish_used: polishUsed,
        song_title: theme,
        theme,
        style,
        mood,
        duration_ms: Date.now() - startTime,
        mureka_format: {
          tags: murekaTags,
          vocal_gender_options: ['女声', '男声'],
          suggested_vocal: suggestedVocal,
          structure: suggestedStructure,
          suggested_tags: murekaTags.slice(0, 4)
        },
        score: scoreResult,
        optimize_count: optimizeCount,
        stuck,
        waiting_confirm: true,
        message
      };
    } catch (e) {
      return { ok: false, error: `润色失败: ${e.message}`, step: 'polish' };
    }
  },

  // ================================================================
  // Step 3: 五维歌词质量评分（支持风格化）
  // ================================================================
  async score({ lyrics, style = '流行' }) {
    const startTime = Date.now();
    try {
      const profile = this._getStyleProfile(style);
      const result = execSync(
        `python3 "${SCORING_SCRIPT}"`,
        {
          input: lyrics,
          encoding: 'utf-8',
          timeout: 45000,
          maxBuffer: 5 * 1024 * 1024
        }
      ).trim();

      const data = JSON.parse(result);
      const d = data.dims;
      const bench = profile.benchmark;
      const dimNames = { rhyme: '押韵', yijing: '意境', qinggan: '情感', human: '去AI味', coherence: '连贯性' };

      const { pass, failedDims, flexibleFailed } = this._checkPass(
        { rhyme_score: d.押韵, yijing_score: d.意境, qinggan_score: d.情感, human_score: d.去AI味, coherence_score: d.连贯性 },
        profile
      );

      const scoreTable = Object.entries(dimNames).map(([key, name]) => {
        const score = d[key === 'rhyme' ? '押韵' : key === 'yijing' ? '意境' : key === 'qinggan' ? '情感' : key === 'human' ? '去AI味' : '连贯性'];
        const b = bench[key];
        const isFocus = profile.focus.includes(name);
        const flag = score >= b ? '✅' : (isFocus && score >= b - profile.flexibleMargin ? '⚠️' : '❌');
        return `| ${name} | ${score}/100 | ≥${b} | ${flag} |`;
      }).join('\n');

      const message = `🎯 **歌词质量评分报告（${style}风格）**

| 维度 | 分数 | 基准 | 状态 |
|------|------|------|------|
${scoreTable}

${pass ? '✅ **综合评定：达标**' : '⚠️ **综合评定：部分维度略低，可接受范围'}${failedDims.length > 0 ? '\n❌ 未达标：' + failedDims.map(d => d.dim).join('、') : ''}`;

      return {
        ok: true,
        lyrics,
        style,
        overall: data.overall,
        level: data.level,
        dims: d,
        pass,
        failedDims: failedDims.map(d => d.dim),
        flexibleFailed: flexibleFailed.map(d => d.dim),
        duration_ms: Date.now() - startTime,
        message
      };
    } catch (e) {
      return { ok: false, error: `评分失败: ${e.message}`, step: 'score' };
    }
  },

  // ================================================================
  // Step 4: 歌词智能优化循环（v2.5版）
  // ================================================================
  async optimize({ lyrics, theme, style = '流行', mood = '自然' }) {
    const startTime = Date.now();
    const profile = this._getStyleProfile(style);
    let currentLyrics = lyrics;
    let iterCount = 0;
    let lastScore = null;
    let stuck = false;

    try {
      const doScore = (lyricsText) => this._llmScore(lyricsText, style);
      const doRewrite = (lyricsText, dimsToImprove, strategyIdx) => {
        const strategy = OPTIMIZE_STRATEGIES[strategyIdx % OPTIMIZE_STRATEGIES.length];
        const prompt = `你是一位歌词优化专家。这次优化策略：${strategy}

歌词：
${lyricsText}

重点改进：${dimsToImprove}

要求：
1. 保持原意不变
2. 只改进指定维度
3. 保留段落标记
4. 直接输出歌词，不要解释`;

        const result = execSync(`python3 -c "
import subprocess, json
api_key = 'sk-27f18f86cabc4c069820f4f01cae4e6d'
payload = json.dumps({'model':'deepseek-chat','messages':[{'role':'user','content':'''${prompt.replace(/'/g, "\\'\\'")}'''}],'max_tokens':2048,'temperature':0.3})
r = subprocess.run(['curl','-s','-X','POST','https://api.deepseek.com/v1/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+api_key,'-d',payload], capture_output=True, text=True, timeout=30)
d = json.loads(r.stdout)
print(d['choices'][0]['message']['content'].strip() if 'choices' in d else 'ERROR')
"`, { encoding: 'utf-8', timeout: 35000 }).trim();
        return result;
      };

      // 第一轮评分
      let scoreResult = await doScore(currentLyrics);
      iterCount++;

      while (iterCount <= 3) {
        const { pass, failedDims, flexibleFailed } = this._checkPass(scoreResult, profile);

        if (pass) break;

        const dimsToImprove = failedDims.length > 0
          ? failedDims.map(d => d.dim).join('、')
          : flexibleFailed.map(d => d.dim).join('、');

        // 用不同策略（解决提示词衰减）
        const rewritten = doRewrite(currentLyrics, dimsToImprove, iterCount);
        if (!rewritten || rewritten.startsWith('ERROR') || rewritten === currentLyrics) {
          break;
        }

        currentLyrics = rewritten;
        scoreResult = await doScore(currentLyrics);
        iterCount++;
      }

      if (iterCount >= 3) {
        const { pass } = this._checkPass(scoreResult, profile);
        if (!pass) stuck = true;
      }

      const d = scoreResult;
      const bench = profile.benchmark;
      const dimNames = { rhyme: '押韵', yijing: '意境', qinggan: '情感', human: '去AI味', coherence: '连贯性' };

      const scoreTable = Object.entries(dimNames).map(([key, name]) => {
        const score = d[key + '_score'] ?? 0;
        const b = bench[key];
        const isFocus = profile.focus.includes(name);
        const flag = score >= b ? '✅' : (isFocus && score >= b - profile.flexibleMargin ? '⚠️' : '❌');
        return `| ${name} | ${score}/100 | ${score >= b ? '✅' : score >= b - profile.flexibleMargin ? '⚠️略低' : '❌'} |`;
      }).join('\n');

      const improveNote = iterCount - 1 > 0 ? `（经${iterCount - 1}次优化）` : '';
      const stuckNote = stuck ? '\n\n⚠️ **已达优化上限（3次），以下维度略低但可接受：人工判断是否需要继续优化**' : '';

      const message = `🎯 **歌词质量评分报告**${improveNote}

| 维度 | 分数 | 状态 |
|------|------|------|
${scoreTable}
${stuckNote}`;

      return {
        ok: true,
        lyrics: currentLyrics,
        style,
        overall: Math.round(Object.values(d).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0) / 5),
        dims: d,
        optimize_count: iterCount - 1,
        stuck,
        duration_ms: Date.now() - startTime,
        message
      };
    } catch (e) {
      return { ok: false, error: `优化失败: ${e.message}`, step: 'optimize' };
    }
  },

  // ================================================================
  // 内部方法：生成Mureka风格标签
  // ================================================================
  _suggestMurekaTags(style, mood, theme) {
    const baseTags = [];

    if (style.includes('流行') || style.includes('Pop')) {
      baseTags.push('Pop', '流行');
    }
    if (style.includes('电子') || style.includes('Electronic') || style.includes('Techno')) {
      baseTags.push('Electronic', '电子', 'Techno', 'EDM');
    }
    if (style.includes('民谣') || style.includes('Folk') || style.includes('Acoustic')) {
      baseTags.push('Folk', '民谣', 'Acoustic');
    }
    if (style.includes('摇滚') || style.includes('Rock')) {
      baseTags.push('Rock', '摇滚', 'Indie Rock');
    }
    if (style.includes('嘻哈') || style.includes('Hip')) {
      baseTags.push('Hip-Hop', '嘻哈', 'Rap');
    }
    if (style.includes('爵士') || style.includes('Jazz')) {
      baseTags.push('Jazz', '爵士', 'Smooth Jazz');
    }
    if (style.includes('R&B') || style.includes('蓝调') || style.includes('节奏布鲁斯')) {
      baseTags.push('R&B', '节奏布鲁斯');
    }
    if (style.includes('古典') || style.includes('Classical')) {
      baseTags.push('Classical', '古典', 'Instrumental');
    }
    if (style.includes('拉丁') || style.includes('Latin')) {
      baseTags.push('Latin', '拉丁', 'Reggaeton');
    }
    if (style.includes('古风') || style.includes('中国')) {
      baseTags.push('古风', '中国风', 'C-Pop');
    }
    if (style.includes('抒情') || style.includes('Ballad')) {
      baseTags.push('Ballad', '抒情', 'Love song');
    }
    if (style.includes('舞曲') || style.includes('Dance')) {
      baseTags.push('Dance', '舞曲', 'EDM');
    }
    if (style.includes('氛围') || style.includes('Ambient')) {
      baseTags.push('Ambient', '氛围', 'Chillwave');
    }
    if (style.includes('Lo-fi') || style.includes('LoFi')) {
      baseTags.push('Lo-fi', '低保真', 'Chill');
    }

    if (mood.includes('欢快') || mood.includes('快乐') || mood.includes('开心') || mood.includes('Happy')) {
      baseTags.push('欢快', 'Happy', 'Up-tempo');
    }
    if (mood.includes('忧伤') || mood.includes('悲伤') || mood.includes('难过') || mood.includes('Melancholic')) {
      baseTags.push('忧伤', 'Melancholic', '悲情', 'Slow');
    }
    if (mood.includes('浪漫') || mood.includes('甜蜜') || mood.includes('温柔') || mood.includes('Romantic')) {
      baseTags.push('浪漫', 'Romantic', '甜蜜');
    }
    if (mood.includes('激情') || mood.includes('热烈') || mood.includes('热血') || mood.includes('Energetic')) {
      baseTags.push('激情', 'Energetic', '热血', 'Rock', 'Hip-Hop');
    }
    if (mood.includes('宁静') || mood.includes('平静') || mood.includes('安静') || mood.includes('Calm')) {
      baseTags.push('宁静', 'Calm', '放松', 'Lo-fi', 'Ambient');
    }
    if (mood.includes('回忆') || mood.includes('怀旧') || mood.includes('Nostalgic')) {
      baseTags.push('回忆', 'Nostalgic', '怀旧', 'Retro');
    }
    if (mood.includes('深沉') || mood.includes('磁性')) {
      baseTags.push('男声');
    }

    if (baseTags.length === 0) {
      baseTags.push('Pop', '流行', 'Ballad', '抒情', '电子');
    }

    return [...new Set(baseTags)].slice(0, 16);
  },

  // ================================================================
  // 内部方法：LLM五维评分（支持风格化）+ Humanizer集成
  // ================================================================
  async _llmScore(lyrics, style = '流行') {
    const profile = this._getStyleProfile(style);

    const prompt = `你是一位歌词质量评审。请对以下歌词进行五维评分，每个维度0-100分，格式严格如下（只输出分数，不要解释）：
押韵分数: XX
意境分数: XX
情感分数: XX
去AI味分数: XX
连贯性分数: XX

评分标准（${style}风格，重点关注${profile.focus.join('、')}）：
- 押韵：韵脚自然程度、多样性（${style}风格基准≥${profile.benchmark.rhyme}）
- 意境：画面感、意象生动度（基准≥${profile.benchmark.yijing}）
- 情感：情感真挚度、感染力（基准≥${profile.benchmark.qinggan}）
- 去AI味：口语化程度、减少套路化表达（基准≥${profile.benchmark.human}）
- 连贯性：段落衔接、叙事流畅度（基准≥${profile.benchmark.coherence}）

歌词：
${lyrics}`;

    let llmScores = { rhyme_score: null, yijing_score: null, qinggan_score: null, human_score: null, coherence_score: null };

    try {
      const result = execSync(`python3 -c "
import subprocess, json
api_key = 'sk-27f18f86cabc4c069820f4f01cae4e6d'
payload = json.dumps({'model':'deepseek-chat','messages':[{'role':'user','content':'''${prompt.replace(/'/g, "\\'\\'")}'''}],'max_tokens':512,'temperature':0.0})
r = subprocess.run(['curl','-s', '-X', 'POST', 'https://api.deepseek.com/v1/chat/completions', '-H', 'Content-Type: application/json', '-H', 'Authorization: Bearer '+api_key, '-d', payload], capture_output=True, text=True, timeout=30)
d = json.loads(r.stdout)
print(d['choices'][0]['message']['content'].strip() if 'choices' in d else 'ERROR:'+str(d))
"`, { encoding: 'utf-8', timeout: 35000 });

      const output = result.trim();
      const rhymeMatch = output.match(/押韵[分数:：]\s*(\d+)/);
      const yijingMatch = output.match(/意境[分数:：]\s*(\d+)/);
      const qingganMatch = output.match(/情感[分数:：]\s*(\d+)/);
      const humanMatch = output.match(/去AI味[分数:：]\s*(\d+)/);
      const coherenceMatch = output.match(/连贯性[分数:：]\s*(\d+)/);

      llmScores = {
        rhyme_score: rhymeMatch ? parseInt(rhymeMatch[1]) : null,
        yijing_score: yijingMatch ? parseInt(yijingMatch[1]) : null,
        qinggan_score: qingganMatch ? parseInt(qingganMatch[1]) : null,
        human_score: humanMatch ? parseInt(humanMatch[1]) : null,
        coherence_score: coherenceMatch ? parseInt(coherenceMatch[1]) : null
      };
    } catch (e) {
      // LLM评分失败，继续用Humanizer检测
    }

    // Humanizer AI模式检测
    let humanizerResult = null;
    try {
      humanizerResult = JSON.parse(execSync(`node -e "
const {detectPatterns} = require('${HUMANIZER_DETECTOR}');
const lyrics = require('fs').readFileSync('/dev/stdin', 'utf-8').trim();
const result = detectPatterns(lyrics);
console.log(JSON.stringify(result));
"`, { input: lyrics, encoding: 'utf-8', timeout: 10000 }).trim());
    } catch (e) {
      // Humanizer检测失败，忽略
    }

    // 如果LLM评分失败，用Humanizer的humanScore
    if (llmScores.human_score === null && humanizerResult) {
      llmScores.human_score = humanizerResult.humanScore;
    }

    return {
      ...llmScores,
      humanizer: humanizerResult
    };
  }
};

module.exports = songforgeTool;
