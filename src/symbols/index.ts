/**
 * 常用数学符号表（参考 latexlive.com 分类，编译期内联、零网络请求）
 *
 * 分组顺序（2026-10-18 与王先生确认后调整）：
 *   常用符号 → 希腊字母 → 二元关系 → 箭头 → 集合与逻辑
 *   → 分数微分 → 根式角标 → 极限对数 → 三角函数 → 积分运算 → 大型运算 → 括号取整 → 数组矩阵
 * 侧边栏「快捷工具」顶部的分组跳转控件即按本数组顺序生成。
 *
 * 字段语义：
 *  · `label`        —— 渲染前的占位文本（Unicode），也是渲染失败时的降级显示；
 *  · `latex`        —— 点击后插入源码编辑区的命令，`CURSOR` 表示插入后光标停靠位置；
 *  · `displayLatex` —— 按钮**展示**用的 LaTeX（渲染成按钮图形），与插入用 `latex` 解耦；
 *                      缺省时取 `latex` 并把 `CURSOR` 换成 `\square` 占位方块；
 *                      需要「插入空骨架、展示真实案例」的条目（分数显示 a/b、矩阵显示 a₁₁…）
 *                      必须显式给出；
 *  · `remark`       —— 悬停弹窗第二行备注（中英双语）；首批覆盖前四个分组。
 *
 * 渲染策略：运行时走宿主 `renderMath`（与笔记正文同链路 → Computer Modern / TeX 字体），
 * 按钮进入视口才渲染并缓存结果，见 `src/panel/formulaView.ts`。
 */

import { CURSOR } from '../core/constants';
import type { Bilingual, SymbolGroup, SymbolItem } from '../types';

/** 第三参数：展示用 latex / 悬停备注 / 显式跨列数（都可省略） */
type SymbolExtra = Pick<SymbolItem, 'displayLatex' | 'remark' | 'span'>;

const s = (label: string, latex: string, extra?: SymbolExtra): SymbolItem =>
	extra ? { label, latex, ...extra } : { label, latex };
const b = (zh: string, en: string): Bilingual => ({ zh, en });

export const SYMBOL_GROUPS: SymbolGroup[] = [
	{
		id: 'common',
		name: b('常用符号', 'Common'),
		items: [
			s('±', '\\pm', { remark: { zh: '正负号', en: 'plus-minus sign' } }), s('∓', '\\mp', { remark: { zh: '负正号', en: 'minus-plus sign' } }), s('×', '\\times', { remark: { zh: '乘号', en: 'multiplication sign' } }), s('÷', '\\div', { remark: { zh: '除号', en: 'division sign' } }),
			s('⋅', '\\cdot', { remark: { zh: '点乘', en: 'dot product' } }), s('∗', '\\ast', { remark: { zh: '星号运算符', en: 'asterisk operator' } }), s('∘', '\\circ', { remark: { zh: '复合（圈乘）', en: 'ring operator / composition' } }), s('∙', '\\bullet', { remark: { zh: '实心圆点', en: 'bullet operator' } }),
			s('≤', '\\leq', { remark: { zh: '小于等于', en: 'less than or equal to' } }), s('≥', '\\geq', { remark: { zh: '大于等于', en: 'greater than or equal to' } }), s('≠', '\\neq', { remark: { zh: '不等于', en: 'not equal to' } }), s('≈', '\\approx', { remark: { zh: '约等于', en: 'approximately equal to' } }),
			s('≡', '\\equiv', { remark: { zh: '恒等', en: 'identical to / equivalent' } }), s('∝', '\\propto', { remark: { zh: '正比于', en: 'proportional to' } }), s('∼', '\\sim', { remark: { zh: '相似 / 渐近', en: 'similar to' } }), s('≅', '\\cong', { remark: { zh: '全等', en: 'congruent to' } }),
			s('∞', '\\infty', { remark: { zh: '无穷大', en: 'infinity' } }), s('∂', '\\partial', { remark: { zh: '偏导符号', en: 'partial derivative' } }), s('∇', '\\nabla', { remark: { zh: '梯度算子', en: 'nabla / gradient' } }), s('∅', '\\emptyset', { remark: { zh: '空集', en: 'empty set' } }),
			s('∈', '\\in', { remark: { zh: '属于', en: 'element of' } }), s('∉', '\\notin', { remark: { zh: '不属于', en: 'not an element of' } }), s('⊂', '\\subset', { remark: { zh: '真子集', en: 'proper subset' } }), s('⊆', '\\subseteq', { remark: { zh: '子集（可等）', en: 'subset or equal to' } }),
			s('∪', '\\cup', { remark: { zh: '并集', en: 'union' } }), s('∩', '\\cap', { remark: { zh: '交集', en: 'intersection' } }), s('∀', '\\forall', { remark: { zh: '全称量词（任意）', en: 'for all' } }), s('∃', '\\exists', { remark: { zh: '存在量词（存在）', en: 'there exists' } }),
			s('→', '\\rightarrow', { remark: { zh: '右箭头', en: 'right arrow' } }), s('⇒', '\\Rightarrow', { remark: { zh: '蕴含（推出）', en: 'implies' } }), s('↦', '\\mapsto', { remark: { zh: '映射到', en: 'maps to' } }), s('⇔', '\\Leftrightarrow', { remark: { zh: '等价（当且仅当）', en: 'if and only if' } }),
			s('∴', '\\therefore', { remark: { zh: '所以', en: 'therefore' } }), s('∵', '\\because', { remark: { zh: '因为', en: 'because' } }), s('ℝ', '\\mathbb{R}', { remark: { zh: '实数集', en: 'real numbers' } }), s('□', '\\square', { remark: { zh: '占位方块（待填）', en: 'placeholder square' } }),
		],
	},
	{
		id: 'greek',
		name: b('希腊字母', 'Greek letters'),
		items: [
			s('α', '\\alpha', { remark: { zh: '希腊字母 α（小写）', en: 'Greek alpha (lowercase)' } }), s('β', '\\beta', { remark: { zh: '希腊字母 β（小写）', en: 'Greek beta (lowercase)' } }), s('γ', '\\gamma', { remark: { zh: '希腊字母 γ（小写）', en: 'Greek gamma (lowercase)' } }), s('δ', '\\delta', { remark: { zh: '希腊字母 δ（小写）', en: 'Greek delta (lowercase)' } }),
			s('ε', '\\epsilon', { remark: { zh: '希腊字母 ε（小写）', en: 'Greek epsilon (lowercase)' } }), s('ζ', '\\zeta', { remark: { zh: '希腊字母 ζ（小写）', en: 'Greek zeta (lowercase)' } }), s('η', '\\eta', { remark: { zh: '希腊字母 η（小写）', en: 'Greek eta (lowercase)' } }), s('θ', '\\theta', { remark: { zh: '希腊字母 θ（小写）', en: 'Greek theta (lowercase)' } }),
			s('ι', '\\iota', { remark: { zh: '希腊字母 ι（小写）', en: 'Greek iota (lowercase)' } }), s('κ', '\\kappa', { remark: { zh: '希腊字母 κ（小写）', en: 'Greek kappa (lowercase)' } }), s('λ', '\\lambda', { remark: { zh: '希腊字母 λ（小写）', en: 'Greek lambda (lowercase)' } }), s('μ', '\\mu', { remark: { zh: '希腊字母 μ（小写）', en: 'Greek mu (lowercase)' } }),
			s('ν', '\\nu', { remark: { zh: '希腊字母 ν（小写）', en: 'Greek nu (lowercase)' } }), s('ξ', '\\xi', { remark: { zh: '希腊字母 ξ（小写）', en: 'Greek xi (lowercase)' } }), s('π', '\\pi', { remark: { zh: '希腊字母 π（小写）', en: 'Greek pi (lowercase)' } }), s('ρ', '\\rho', { remark: { zh: '希腊字母 ρ（小写）', en: 'Greek rho (lowercase)' } }),
			s('σ', '\\sigma', { remark: { zh: '希腊字母 σ（小写）', en: 'Greek sigma (lowercase)' } }), s('τ', '\\tau', { remark: { zh: '希腊字母 τ（小写）', en: 'Greek tau (lowercase)' } }), s('υ', '\\upsilon', { remark: { zh: '希腊字母 υ（小写）', en: 'Greek upsilon (lowercase)' } }), s('φ', '\\phi', { remark: { zh: '希腊字母 φ（小写）', en: 'Greek phi (lowercase)' } }),
			s('χ', '\\chi', { remark: { zh: '希腊字母 χ（小写）', en: 'Greek chi (lowercase)' } }), s('ψ', '\\psi', { remark: { zh: '希腊字母 ψ（小写）', en: 'Greek psi (lowercase)' } }), s('ω', '\\omega', { remark: { zh: '希腊字母 ω（小写）', en: 'Greek omega (lowercase)' } }), s('ϵ', '\\varepsilon', { remark: { zh: '希腊字母 ϵ（小写变体）', en: 'Greek varepsilon (lowercase)' } }),
			s('ϑ', '\\vartheta', { remark: { zh: '希腊字母 ϑ（小写变体）', en: 'Greek vartheta (lowercase)' } }), s('ϖ', '\\varpi', { remark: { zh: '希腊字母 ϖ（小写变体）', en: 'Greek varpi (lowercase)' } }), s('ϱ', '\\varrho', { remark: { zh: '希腊字母 ϱ（小写变体）', en: 'Greek varrho (lowercase)' } }), s('ς', '\\varsigma', { remark: { zh: '希腊字母 ς（小写变体）', en: 'Greek varsigma (lowercase)' } }),
			s('ϕ', '\\varphi', { remark: { zh: '希腊字母 ϕ（小写变体）', en: 'Greek varphi (lowercase)' } }), s('Γ', '\\Gamma', { remark: { zh: '希腊字母 Γ（大写）', en: 'Greek Gamma (uppercase)' } }), s('Δ', '\\Delta', { remark: { zh: '希腊字母 Δ（大写）', en: 'Greek Delta (uppercase)' } }), s('Θ', '\\Theta', { remark: { zh: '希腊字母 Θ（大写）', en: 'Greek Theta (uppercase)' } }),
			s('Λ', '\\Lambda', { remark: { zh: '希腊字母 Λ（大写）', en: 'Greek Lambda (uppercase)' } }), s('Ξ', '\\Xi', { remark: { zh: '希腊字母 Ξ（大写）', en: 'Greek Xi (uppercase)' } }), s('Π', '\\Pi', { remark: { zh: '希腊字母 Π（大写）', en: 'Greek Pi (uppercase)' } }), s('Σ', '\\Sigma', { remark: { zh: '希腊字母 Σ（大写）', en: 'Greek Sigma (uppercase)' } }),
			s('Υ', '\\Upsilon', { remark: { zh: '希腊字母 Υ（大写）', en: 'Greek Upsilon (uppercase)' } }), s('Φ', '\\Phi', { remark: { zh: '希腊字母 Φ（大写）', en: 'Greek Phi (uppercase)' } }), s('Ψ', '\\Psi', { remark: { zh: '希腊字母 Ψ（大写）', en: 'Greek Psi (uppercase)' } }), s('Ω', '\\Omega', { remark: { zh: '希腊字母 Ω（大写）', en: 'Greek Omega (uppercase)' } }),
		],
	},
	{
		id: 'relation',
		name: b('二元关系', 'Relations'),
		items: [
			s('≤', '\\leq', { remark: { zh: '小于等于', en: 'less than or equal to' } }), s('≥', '\\geq', { remark: { zh: '大于等于', en: 'greater than or equal to' } }), s('≠', '\\neq', { remark: { zh: '不等于', en: 'not equal to' } }), s('≈', '\\approx', { remark: { zh: '约等于', en: 'approximately equal to' } }),
			s('≡', '\\equiv', { remark: { zh: '恒等', en: 'identical to' } }), s('∼', '\\sim', { remark: { zh: '相似', en: 'similar to' } }), s('≃', '\\simeq', { remark: { zh: '渐近等于', en: 'asymptotically equal to' } }), s('≅', '\\cong', { remark: { zh: '全等', en: 'congruent to' } }),
			s('∝', '\\propto', { remark: { zh: '正比于', en: 'proportional to' } }), s('≪', '\\ll', { remark: { zh: '远小于', en: 'much less than' } }), s('≫', '\\gg', { remark: { zh: '远大于', en: 'much greater than' } }), s('≍', '\\asymp', { remark: { zh: '渐近等价', en: 'asymptotically equivalent' } }),
			s('⊂', '\\subset', { remark: { zh: '真子集', en: 'proper subset' } }), s('⊃', '\\supset', { remark: { zh: '真超集', en: 'proper superset' } }), s('⊆', '\\subseteq', { remark: { zh: '子集（可等）', en: 'subset or equal to' } }), s('⊇', '\\supseteq', { remark: { zh: '超集（可等）', en: 'superset or equal to' } }),
			s('∈', '\\in', { remark: { zh: '属于', en: 'element of' } }), s('∋', '\\ni', { remark: { zh: '包含该元素', en: 'contains as element' } }), s('∉', '\\notin', { remark: { zh: '不属于', en: 'not an element of' } }), s('∌', '\\not\\ni', { remark: { zh: '不含该元素', en: 'does not contain as element' } }),
			s('⊥', '\\perp', { remark: { zh: '垂直', en: 'perpendicular to' } }), s('∥', '\\parallel', { remark: { zh: '平行', en: 'parallel to' } }), s('∤', '\\nmid', { remark: { zh: '不整除', en: 'does not divide' } }), s('∣', '\\mid', { remark: { zh: '整除', en: 'divides' } }),
			s('≺', '\\prec', { remark: { zh: '前于', en: 'precedes' } }), s('≻', '\\succ', { remark: { zh: '后于', en: 'succeeds' } }), s('⪯', '\\preceq', { remark: { zh: '前于或等价', en: 'precedes or equal to' } }), s('⪰', '\\succeq', { remark: { zh: '后于或等价', en: 'succeeds or equal to' } }),
			s('⊨', '\\models', { remark: { zh: '满足（模型蕴含）', en: 'models / entails' } }), s('⊢', '\\vdash', { remark: { zh: '可证', en: 'proves' } }), s('⊣', '\\dashv', { remark: { zh: '反向可证', en: 'does not prove / dashv' } }), s('⌣', '\\smile', { remark: { zh: '微笑符（同伦）', en: 'smile (homotopy)' } }),
			s('≈ 约等', '\\approx', { span: 2, remark: { zh: '约等于', en: 'approximately equal to' } }), s('≐', '\\doteq', { remark: { zh: '按定义等于', en: 'equals by definition' } }), s('⋘', '\\lll', { remark: { zh: '远小于的远小于', en: 'much much less than' } }), s('≡ 恒等', '\\equiv', { span: 2, remark: { zh: '恒等', en: 'identical to' } }),
		],
	},
	{
		id: 'arrow',
		name: b('箭头', 'Arrows'),
		items: [
			s('→', '\\rightarrow', { remark: { zh: '右箭头', en: 'right arrow' } }), s('←', '\\leftarrow', { remark: { zh: '左箭头', en: 'left arrow' } }), s('↔', '\\leftrightarrow', { remark: { zh: '双向箭头', en: 'left-right arrow' } }), s('↦', '\\mapsto', { remark: { zh: '映射到', en: 'maps to' } }),
			s('⇒', '\\Rightarrow', { remark: { zh: '蕴含（推出）', en: 'implies' } }), s('⇐', '\\Leftarrow', { remark: { zh: '反蕴含', en: 'implied by' } }), s('⇔', '\\Leftrightarrow', { remark: { zh: '等价（当且仅当）', en: 'if and only if' } }), s('⟺', '\\iff', { remark: { zh: '长等价箭头', en: 'long if and only if' } }),
			s('⟶', '\\longrightarrow', { remark: { zh: '长右箭头', en: 'long right arrow' } }), s('⟵', '\\longleftarrow', { remark: { zh: '长左箭头', en: 'long left arrow' } }), s('⟹', '\\Longrightarrow', { remark: { zh: '长双线右箭头', en: 'long double right arrow' } }), s('⟸', '\\Longleftarrow', { remark: { zh: '长双线左箭头', en: 'long double left arrow' } }),
			s('↑', '\\uparrow', { remark: { zh: '上箭头', en: 'up arrow' } }), s('↓', '\\downarrow', { remark: { zh: '下箭头', en: 'down arrow' } }), s('↕', '\\updownarrow', { remark: { zh: '上下双向箭头', en: 'up-down arrow' } }), s('⇑', '\\Uparrow', { remark: { zh: '双线上箭头', en: 'double up arrow' } }),
			s('⇓', '\\Downarrow', { remark: { zh: '双线下箭头', en: 'double down arrow' } }), s('⇕', '\\Updownarrow', { remark: { zh: '双线上下箭头', en: 'double up-down arrow' } }), s('↗', '\\nearrow', { remark: { zh: '右上箭头', en: 'north-east arrow' } }), s('↘', '\\searrow', { remark: { zh: '右下箭头', en: 'south-east arrow' } }),
			s('↖', '\\nwarrow', { remark: { zh: '左上箭头', en: 'north-west arrow' } }), s('↙', '\\swarrow', { remark: { zh: '左下箭头', en: 'south-west arrow' } }), s('↪', '\\hookrightarrow', { remark: { zh: '右钩箭头（嵌入）', en: 'hook right arrow' } }), s('↩', '\\hookleftarrow', { remark: { zh: '左钩箭头', en: 'hook left arrow' } }),
			s('⇀', '\\rightharpoonup', { remark: { zh: '右半箭头', en: 'right harpoon up' } }), s('⇁', '\\rightharpoondown', { remark: { zh: '右半下箭头', en: 'right harpoon down' } }), s('⇝', '\\rightsquigarrow', { remark: { zh: '右波浪箭头', en: 'right squiggle arrow' } }), s('⇌', '\\rightleftharpoons', { remark: { zh: '可逆反应箭头', en: 'reversible arrow' } }),
			s('x→f', '\\overset{f}{\\longrightarrow}', { remark: { zh: '右箭头（上方标注 f）', en: 'right arrow labeled f' } }), s('x←g', '\\overset{g}{\\longleftarrow}', { remark: { zh: '左箭头（上方标注 g）', en: 'left arrow labeled g' } }),
		],
	},
	{
		id: 'sets',
		name: b('集合与逻辑', 'Sets & logic'),
		items: [
			s('∅', '\\emptyset', { remark: { zh: '空集', en: 'empty set' } }), s('∅ 变体', '\\varnothing', { span: 2, remark: { zh: '空集（变体）', en: 'empty set (variant)' } }), s('ℕ', '\\mathbb{N}', { remark: { zh: '自然数集', en: 'natural numbers' } }), s('ℤ', '\\mathbb{Z}', { remark: { zh: '整数集', en: 'integers' } }),
			s('ℚ', '\\mathbb{Q}', { remark: { zh: '有理数集', en: 'rational numbers' } }), s('ℝ', '\\mathbb{R}', { remark: { zh: '实数集', en: 'real numbers' } }), s('ℂ', '\\mathbb{C}', { remark: { zh: '复数集', en: 'complex numbers' } }), s('ℙ', '\\mathbb{P}', { remark: { zh: '素数集', en: 'prime numbers' } }),
			s('∀', '\\forall', { remark: { zh: '全称量词（任意）', en: 'for all' } }), s('∃', '\\exists', { remark: { zh: '存在量词（存在）', en: 'there exists' } }), s('∄', '\\nexists', { remark: { zh: '不存在', en: 'there does not exist' } }), s('¬', '\\neg', { remark: { zh: '逻辑非', en: 'logical not' } }),
			s('∧', '\\land', { remark: { zh: '逻辑与', en: 'logical and' } }), s('∨', '\\lor', { remark: { zh: '逻辑或', en: 'logical or' } }), s('⊕', '\\oplus', { remark: { zh: '异或', en: 'exclusive or' } }), s('⟹', '\\implies', { remark: { zh: '蕴含', en: 'implies' } }),
			s('⟺', '\\iff', { remark: { zh: '等价', en: 'if and only if' } }), s('∴', '\\therefore', { remark: { zh: '所以', en: 'therefore' } }), s('∵', '\\because', { remark: { zh: '因为', en: 'because' } }), s('□', '\\square', { remark: { zh: '证毕', en: 'end of proof' } }),
			s('◇', '\\Diamond', { remark: { zh: '菱形符号', en: 'diamond' } }), s('⊤', '\\top', { remark: { zh: '永真（顶）', en: 'tautology / top' } }), s('⊥', '\\bot', { remark: { zh: '矛盾（底）', en: 'contradiction / bottom' } }), s('∖', '\\setminus', { remark: { zh: '差集', en: 'set difference' } }),
			s('⨁', '\\oplus', { remark: { zh: '直和', en: 'direct sum' } }), s('⊘', '\\oslash', { remark: { zh: '排除（斜线圆圈）', en: 'oslash' } }), s('⊎', '\\uplus', { remark: { zh: '多重并', en: 'multiset union' } }), s('△', '\\triangle', { remark: { zh: '三角形', en: 'triangle' } }),
		],
	},
	{
		id: 'fraction',
		name: b('分数微分', 'Fractions & differentials'),
		items: [
			// 展示 a/b 真实分式（而非 \square 占位方块），插入仍是空骨架；
			// 渲染宽度只有约 20px，显式 span 1（默认会按 label "a/b" 算成 2 列，显得过宽）
			s('a/b', `\\frac{${CURSOR}}{}`, { displayLatex: '\\frac{a}{b}', span: 1, remark: { zh: '分数（空骨架）', en: 'fraction (empty)' } }),
			s('a/b 大', `\\dfrac{${CURSOR}}{}`, { displayLatex: '\\dfrac{a}{b}', span: 1, remark: { zh: '大型分数', en: 'display-style fraction' } }),
			s('a/b 小', `\\tfrac{${CURSOR}}{}`, { displayLatex: '\\tfrac{a}{b}', span: 1, remark: { zh: '小型分数', en: 'text-style fraction' } }),
			// 连分数体积大、占用多列，已移到「公式模板 → 分数与根式」（2026-10-18）
			s('a/b 斜', `${CURSOR}/{ }`, { displayLatex: 'a/b', span: 1, remark: { zh: '斜杠分数', en: 'slashed fraction' } }),
			s('∂', '\\partial', { remark: { zh: '偏导符号', en: 'partial derivative' } }), s('∂²', '\\partial^{2}', { remark: { zh: '二阶偏导', en: 'second partial derivative' } }), s('∂ᵢ', '\\partial_{i}', { remark: { zh: '对第 i 个变量偏导', en: 'partial with respect to i' } }),
			s('∂y/∂x', '\\frac{\\partial y}{\\partial x}', { remark: { zh: '偏导数', en: 'partial derivative of y' } }),
			s('∂²y/∂x²', '\\frac{\\partial^{2} y}{\\partial x^{2}}', { span: 2, remark: { zh: '二阶偏导', en: 'second partial derivative' } }),
			s('∂f/∂x', `\\frac{\\partial ${CURSOR}}{\\partial x}`, { displayLatex: '\\frac{\\partial f}{\\partial x}', remark: { zh: '偏导（分子待填）', en: 'partial derivative (blank numerator)' } }),
			s('ⅆ', '\\mathrm{d}', { remark: { zh: '微分算子', en: 'differential operator' } }), s('ⅆy/ⅆx', '\\frac{\\mathrm{d}y}{\\mathrm{d}x}', { remark: { zh: '一阶导数', en: 'first derivative' } }),
			s('ⅆf/ⅆx', `\\frac{\\mathrm{d}${CURSOR}}{\\mathrm{d}x}`, { displayLatex: '\\frac{\\mathrm{d}f}{\\mathrm{d}x}', remark: { zh: '导数（分子待填）', en: 'derivative (blank numerator)' } }),
			s('∇', '\\nabla', { remark: { zh: '梯度算子', en: 'nabla / gradient' } }), s('Δ', '\\Delta', { remark: { zh: '增量 / 差分', en: 'increment / difference' } }), s('□', '\\square', { remark: { zh: '占位方块', en: 'placeholder square' } }), s('▪', '\\blacksquare', { remark: { zh: '证毕符号', en: 'end of proof' } }),
			s('′', "'", { remark: { zh: '一阶导数撇', en: 'prime' } }), s('″', "''", { remark: { zh: '二阶导数撇', en: 'double prime' } }), s('‴', "'''", { remark: { zh: '三阶导数撇', en: 'triple prime' } }), s('∂ₜ', '\\partial_{t}', { remark: { zh: '对时间偏导', en: 'time partial derivative' } }),
		],
	},
	{
		id: 'radical',
		name: b('根式角标', 'Radicals & scripts'),
		items: [
			s('√', `\\sqrt{${CURSOR}}`, { remark: { zh: '平方根', en: 'square root' } }), s('ⁿ√', `\\sqrt[n]{${CURSOR}}`, { remark: { zh: 'n 次根', en: 'n-th root' } }),
			s('x²', '^{2}', { remark: { zh: '平方上标', en: 'square' } }), s('x³', '^{3}', { remark: { zh: '立方上标', en: 'cube' } }), s('xⁿ', '^{n}', { remark: { zh: 'n 次幂上标', en: 'n-th power' } }), s('xₙ', '_{n}', { remark: { zh: '下标 n', en: 'subscript n' } }),
			s('xᵢ', '_{i}', { remark: { zh: '下标 i', en: 'subscript i' } }), s('x₀', '_{0}', { remark: { zh: '下标 0', en: 'subscript 0' } }), s('x⁽ⁿ⁾', '^{(n)}', { remark: { zh: '带括号上标', en: 'parenthesized superscript' } }), s('xᵢᵃ', 'x_{i}^{a}', { remark: { zh: '上下标组合', en: 'sub- and superscript' } }),
			s('ₙCₖ', '_{n}C_{k}', { remark: { zh: '组合数（n 选 k）', en: 'binomial coefficient' } }), s('aₙ', 'a_{n}', { remark: { zh: '数列项（下标 n）', en: 'sequence term' } }), s('x̄', `\\overline{${CURSOR}}`, { remark: { zh: '上划线', en: 'overline' } }),
			s('x̲', `\\underline{${CURSOR}}`, { remark: { zh: '下划线', en: 'underline' } }), s('x̄ 长', `\\bar{${CURSOR}}`, { remark: { zh: '上横线（短）', en: 'bar accent' } }),
			s('x⃗', `\\vec{${CURSOR}}`, { remark: { zh: '向量箭头', en: 'vector arrow' } }), s('x̂', `\\hat{${CURSOR}}`, { remark: { zh: '帽子符号', en: 'hat accent' } }),
			s('x̃', `\\tilde{${CURSOR}}`, { remark: { zh: '波浪号', en: 'tilde accent' } }), s('ẋ', `\\dot{${CURSOR}}`, { remark: { zh: '一阶导点', en: 'dot (first derivative)' } }),
			s('ẍ', `\\ddot{${CURSOR}}`, { remark: { zh: '二阶导点', en: 'double dot' } }), s('x⃛', `\\dddot{${CURSOR}}`, { remark: { zh: '三阶导点', en: 'triple dot' } }),
			s('x̂ 宽', `\\widehat{${CURSOR}}`, { remark: { zh: '宽帽子', en: 'wide hat' } }), s('x̃ 宽', `\\widetilde{${CURSOR}}`, { remark: { zh: '宽波浪号', en: 'wide tilde' } }),
			s('⏞', `\\overbrace{${CURSOR}}`, { remark: { zh: '上花括号', en: 'overbrace' } }), s('⏟', `\\underbrace{${CURSOR}}`, { remark: { zh: '下花括号', en: 'underbrace' } }),
			s('ᵃ◌', `\\overset{a}{${CURSOR}}`, { remark: { zh: '上标叠加', en: 'overset' } }), s('◌ₐ', `\\underset{a}{${CURSOR}}`, { remark: { zh: '下标叠加', en: 'underset' } }),
			s('x→', `\\overset{\\to}{${CURSOR}}`, { remark: { zh: '上方右箭头', en: 'overset right arrow' } }), s('x←', `\\overset{\\leftarrow}{${CURSOR}}`, { remark: { zh: '上方左箭头', en: 'overset left arrow' } }),
		],
	},
	{
		id: 'limits',
		name: b('极限对数', 'Limits & logarithms'),
		items: [
			s('lim', '\\lim', { remark: { zh: '极限', en: 'limit' } }), s('lim→', '\\lim_{x \\to 0}', { remark: { zh: 'x 趋于 0 的极限', en: 'limit as x approaches 0' } }), s('lim→∞', '\\lim_{n \\to \\infty}', { remark: { zh: 'n 趋于无穷的极限', en: 'limit as n approaches infinity' } }),
			s('lim⁺', '\\lim_{x \\to 0^{+}}', { remark: { zh: '右极限', en: 'right-sided limit' } }), s('lim⁻', '\\lim_{x \\to 0^{-}}', { remark: { zh: '左极限', en: 'left-sided limit' } }),
			s('lim‾', '\\limsup', { remark: { zh: '上极限', en: 'limit superior' } }), s('lim_', '\\liminf', { remark: { zh: '下极限', en: 'limit inferior' } }),
			s('log', '\\log', { remark: { zh: '对数', en: 'logarithm' } }), s('ln', '\\ln', { remark: { zh: '自然对数', en: 'natural logarithm' } }), s('lg', '\\lg', { remark: { zh: '常用对数（以 10 为底）', en: 'common logarithm' } }),
			s('logₐ', '\\log_{a}', { remark: { zh: '以 a 为底的对数', en: 'logarithm base a' } }), s('log₁₀', '\\log_{10}', { remark: { zh: '以 10 为底的对数', en: 'logarithm base 10' } }), s('log₂', '\\log_{2}', { remark: { zh: '以 2 为底的对数', en: 'logarithm base 2' } }),
			s('ln x', '\\ln x', { remark: { zh: '自然对数 ln x', en: 'natural log of x' } }), s('log x', '\\log x', { remark: { zh: '对数 log x', en: 'logarithm of x' } }), s('eˣ', 'e^{x}', { remark: { zh: '以 e 为底的指数', en: 'exponential of x' } }),
			s('exp', '\\exp', { remark: { zh: '指数函数 exp', en: 'exponential function' } }), s('aˣ', 'a^{x}', { remark: { zh: '一般指数函数', en: 'general exponential' } }),
			s('max', '\\max', { remark: { zh: '最大值', en: 'maximum' } }), s('min', '\\min', { remark: { zh: '最小值', en: 'minimum' } }), s('sup', '\\sup', { remark: { zh: '上确界', en: 'supremum' } }), s('inf', '\\inf', { remark: { zh: '下确界', en: 'infimum' } }),
			s('det', '\\det', { remark: { zh: '行列式', en: 'determinant' } }), s('gcd', '\\gcd', { remark: { zh: '最大公约数', en: 'greatest common divisor' } }), s('lcm', '\\operatorname{lcm}', { remark: { zh: '最小公倍数', en: 'least common multiple' } }),
			s('deg', '\\deg', { remark: { zh: '次数', en: 'degree' } }),
			s('Pr', '\\Pr', { remark: { zh: '概率', en: 'probability' } }), s('sgn', '\\operatorname{sgn}', { remark: { zh: '符号函数', en: 'sign function' } }),
		],
	},
	{
		id: 'trig',
		name: b('三角函数', 'Trigonometric'),
		items: [
			s('sin', '\\sin', { remark: { zh: '正弦', en: 'sine' } }), s('cos', '\\cos', { remark: { zh: '余弦', en: 'cosine' } }), s('tan', '\\tan', { remark: { zh: '正切', en: 'tangent' } }),
			s('cot', '\\cot', { remark: { zh: '余切', en: 'cotangent' } }), s('sec', '\\sec', { remark: { zh: '正割', en: 'secant' } }), s('csc', '\\csc', { remark: { zh: '余割', en: 'cosecant' } }),
			s('arcsin', '\\arcsin', { remark: { zh: '反正弦', en: 'arcsine' } }), s('arccos', '\\arccos', { remark: { zh: '反余弦', en: 'arccosine' } }), s('arctan', '\\arctan', { remark: { zh: '反正切', en: 'arctangent' } }),
			s('arccot', '\\operatorname{arccot}', { remark: { zh: '反余切', en: 'arccotangent' } }), s('arcsec', '\\operatorname{arcsec}', { remark: { zh: '反正割', en: 'arcsecant' } }),
			s('arccsc', '\\operatorname{arccsc}', { remark: { zh: '反余割', en: 'arccosecant' } }),
			s('sin⁻¹', '\\sin^{-1}', { remark: { zh: '反正弦（-1 次幂写法）', en: 'inverse sine' } }), s('cos⁻¹', '\\cos^{-1}', { remark: { zh: '反余弦（-1 次幂写法）', en: 'inverse cosine' } }), s('tan⁻¹', '\\tan^{-1}', { remark: { zh: '反正切（-1 次幂写法）', en: 'inverse tangent' } }),
			s('sinh', '\\sinh', { remark: { zh: '双曲正弦', en: 'hyperbolic sine' } }), s('cosh', '\\cosh', { remark: { zh: '双曲余弦', en: 'hyperbolic cosine' } }), s('tanh', '\\tanh', { remark: { zh: '双曲正切', en: 'hyperbolic tangent' } }),
			s('coth', '\\coth', { remark: { zh: '双曲余切', en: 'hyperbolic cotangent' } }), s('sech', '\\operatorname{sech}', { remark: { zh: '双曲正割', en: 'hyperbolic secant' } }), s('csch', '\\operatorname{csch}', { remark: { zh: '双曲余割', en: 'hyperbolic cosecant' } }),
			s('sin²θ', '\\sin^{2}\\theta', { remark: { zh: '正弦平方', en: 'sine squared' } }), s('cos²θ', '\\cos^{2}\\theta', { remark: { zh: '余弦平方', en: 'cosine squared' } }),
			s('sin 2θ', '\\sin 2\\theta', { remark: { zh: '二倍角正弦', en: 'sine of double angle' } }), s('cos 2θ', '\\cos 2\\theta', { remark: { zh: '二倍角余弦', en: 'cosine of double angle' } }),
			s('tan 2θ', '\\tan 2\\theta', { remark: { zh: '二倍角正切', en: 'tangent of double angle' } }), s('1+tan²', '1 + \\tan^{2}\\theta', { remark: { zh: '正切平方恒等式', en: 'tangent squared identity' } }),
			s('°', '^{\\circ}', { remark: { zh: '度数符号', en: 'degree sign' } }), s('∠', '\\angle', { remark: { zh: '角', en: 'angle' } }), s('sinh⁻¹', '\\sinh^{-1}', { remark: { zh: '反双曲正弦', en: 'inverse hyperbolic sine' } }),
		],
	},
	{
		id: 'integral',
		name: b('积分运算', 'Integrals'),
		items: [
			s('∫', '\\int', { remark: { zh: '不定积分', en: 'integral' } }), s('∬', '\\iint', { remark: { zh: '二重积分', en: 'double integral' } }), s('∭', '\\iiint', { remark: { zh: '三重积分', en: 'triple integral' } }), s('∮', '\\oint', { remark: { zh: '环路积分', en: 'contour integral' } }),
			s('∫ₐᵇ', '\\int_{a}^{b}', { remark: { zh: '定积分（a 到 b）', en: 'definite integral from a to b' } }), s('∫₀¹', '\\int_{0}^{1}', { remark: { zh: '0 到 1 的定积分', en: 'integral from 0 to 1' } }), s('∫₋∞∞', '\\int_{-\\infty}^{\\infty}', { remark: { zh: '全实数轴积分', en: 'integral over the real line' } }),
			s('∬_D', '\\iint_{D}', { remark: { zh: '区域 D 上的二重积分', en: 'double integral over D' } }), s('∭_Ω', '\\iiint_{\\Omega}', { remark: { zh: '区域 Ω 上的三重积分', en: 'triple integral over omega' } }), s('∮_C', '\\oint_{C}', { remark: { zh: '曲线 C 上的环路积分', en: 'contour integral over C' } }),
			// 长公式按渲染宽度显式跨列（默认按 label 宽度算会偏窄）
			s('∫fⅆx', '\\int f(x)\\,\\mathrm{d}x', { span: 3, remark: { zh: '不定积分（含被积函数）', en: 'indefinite integral with integrand' } }),
			s('∫fⅆx 定', '\\int_{a}^{b} f(x)\\,\\mathrm{d}x', { span: 3, remark: { zh: '定积分（含被积函数）', en: 'definite integral with integrand' } }),
			s('∫ᵤ', '\\int_{S}', { remark: { zh: '曲面 S 上的积分', en: 'integral over surface S' } }), s('∫∫∫∫', '\\iiiint', { remark: { zh: '四重积分', en: 'quadruple integral' } }),
			s('∫∫ 域', '\\iint_{D} f(x,y)\\,\\mathrm{d}x\\,\\mathrm{d}y', { span: 4, remark: { zh: '区域 D 上的二重积分（含被积函数）', en: 'double integral with integrand' } }),
			s('∮F·ⅆl', '\\oint_{C} \\vec{F} \\cdot \\mathrm{d}\\vec{l}', { span: 3, remark: { zh: '向量场环量', en: 'circulation of vector field' } }),
			s('∫₀^T', '\\int_{0}^{T}', { remark: { zh: '0 到 T 的积分', en: 'integral from 0 to T' } }), s('∫ⅆx/x', '\\int \\frac{\\mathrm{d}x}{x}', { span: 2, remark: { zh: '对数型积分', en: 'logarithmic integral' } }),
			s('∂∫', '\\partial \\int', { remark: { zh: '偏导与积分组合', en: 'partial derivative of integral' } }), s('∫ 上下限', '\\int\\limits_{a}^{b}', { span: 2, remark: { zh: '显式上下限的积分', en: 'integral with explicit limits' } }),
		],
	},
	{
		id: 'bigop',
		name: b('大型运算', 'Large operators'),
		items: [
			s('∑', '\\sum', { remark: { zh: '求和', en: 'summation' } }), s('∏', '\\prod', { remark: { zh: '连乘', en: 'product' } }), s('∐', '\\coprod', { remark: { zh: '余积', en: 'coproduct' } }),
			s('∑ᵢⁿ', '\\sum_{i=1}^{n}', { remark: { zh: 'i 从 1 到 n 求和', en: 'sum from i to n' } }), s('∑ₙ∞', '\\sum_{n=1}^{\\infty}', { remark: { zh: 'n 从 1 到无穷求和', en: 'sum to infinity' } }),
			s('∑ᵢ', '\\sum_{i}', { remark: { zh: '对 i 求和', en: 'sum over i' } }), s('∏ᵢⁿ', '\\prod_{i=1}^{n}', { remark: { zh: 'i 从 1 到 n 连乘', en: 'product from i to n' } }), s('∏ₙ', '\\prod_{n}', { remark: { zh: '对 n 连乘', en: 'product over n' } }),
			s('⋃', '\\bigcup', { remark: { zh: '大并集', en: 'big union' } }), s('⋂', '\\bigcap', { remark: { zh: '大交集', en: 'big intersection' } }), s('⋁', '\\bigvee', { remark: { zh: '大析取', en: 'big disjunction' } }), s('⋀', '\\bigwedge', { remark: { zh: '大合取', en: 'big conjunction' } }),
			s('⨁', '\\bigoplus', { remark: { zh: '直和', en: 'direct sum' } }), s('⨂', '\\bigotimes', { remark: { zh: '张量积', en: 'tensor product' } }), s('⨀', '\\bigodot', { remark: { zh: '逐点积', en: 'circled dot product' } }),
			s('⨄', '\\biguplus', { remark: { zh: '多重并', en: 'multiset union' } }), s('⨆', '\\bigsqcup', { remark: { zh: '不交并', en: 'disjoint union' } }), s('⨿', '\\amalg', { remark: { zh: '余积（合并）', en: 'amalgamation' } }),
			s('⋃ᵢⁿ', '\\bigcup_{i=1}^{n}', { remark: { zh: 'i 从 1 到 n 的大并集', en: 'big union from i to n' } }), s('⋂ᵢ', '\\bigcap_{i}', { remark: { zh: '对 i 的大交集', en: 'big intersection over i' } }),
			s('∑′', "\\sum'", { remark: { zh: '带撇的求和', en: 'sum with prime' } }), s('∫∑', '\\int \\sum', { remark: { zh: '积分与求和组合', en: 'integral of a sum' } }),
			s('⨊', '\\bigsqcup', { remark: { zh: '不交并（变体）', en: 'disjoint union (variant)' } }), s('lim∑', '\\lim_{n \\to \\infty} \\sum', { remark: { zh: '极限与求和', en: 'limit of a sum' } }),
			s('∑ᵏ', '\\sum_{k}', { remark: { zh: '对 k 求和', en: 'sum over k' } }), s('∏ⱼ', '\\prod_{j}', { remark: { zh: '对 j 连乘', en: 'product over j' } }),
		],
	},
	{
		id: 'bracket',
		name: b('括号取整', 'Brackets & rounding'),
		items: [
			s('( )', `\\left( ${CURSOR} \\right)`, { remark: { zh: '圆括号（自适应）', en: 'parentheses' } }), s('[ ]', `\\left[ ${CURSOR} \\right]`, { remark: { zh: '方括号（自适应）', en: 'brackets' } }),
			s('{ }', `\\left\\{ ${CURSOR} \\right\\}`, { remark: { zh: '花括号（自适应）', en: 'braces' } }), s('⟨ ⟩', `\\left\\langle ${CURSOR} \\right\\rangle`, { remark: { zh: '尖括号', en: 'angle brackets' } }),
			s('| |', `\\left| ${CURSOR} \\right|`, { remark: { zh: '绝对值', en: 'absolute value' } }), s('‖ ‖', `\\left\\lVert ${CURSOR} \\right\\rVert`, { remark: { zh: '范数', en: 'norm' } }),
			s('⌊ ⌋', `\\left\\lfloor ${CURSOR} \\right\\rfloor`, { remark: { zh: '向下取整', en: 'floor' } }),
			s('⌈ ⌉', `\\left\\lceil ${CURSOR} \\right\\rceil`, { remark: { zh: '向上取整', en: 'ceiling' } }),
			s('⌊ ⌉', `\\left\\lfloor ${CURSOR} \\right\\rceil`, { remark: { zh: '混合取整', en: 'mixed floor and ceiling' } }),
			s('⟨|', `\\left\\langle ${CURSOR} \\right|`, { remark: { zh: '左尖括号加竖线（左矢）', en: 'bra notation' } }), s('|⟩', `\\left| ${CURSOR} \\right\\rangle`, { remark: { zh: '竖线加右尖括号（右矢）', en: 'ket notation' } }),
			s('( ) 自适应', `\\left( ${CURSOR} \\right)`, { remark: { zh: '圆括号（自动伸缩）', en: 'auto-sized parentheses' } }),
			s('{ } 无定界', `\\{ ${CURSOR} \\}`, { remark: { zh: '花括号（无定界符）', en: 'braces without delimiter' } }),
			s('⟦ ⟧', `\\left[\\!\\left[ ${CURSOR} \\right]\\!\\right]`, { remark: { zh: '双方括号', en: 'double brackets' } }),
			s('( ) 大', '\\Big( \\quad \\Big)', { remark: { zh: '大号圆括号', en: 'big parentheses' } }), s('[ ] 大', '\\Big[ \\quad \\Big]', { remark: { zh: '大号方括号', en: 'big brackets' } }),
			s('⦃ ⦄', `\\left\\{ ${CURSOR} \\right\\}`, { remark: { zh: '花括号（变体）', en: 'braces (variant)' } }),
			s('| | 单竖', '\\left| \\quad \\right|', { remark: { zh: '单竖线定界符', en: 'single vertical bar' } }),
			s('nCₖ', `\\binom{n}{${CURSOR}}`, { remark: { zh: '组合数', en: 'binomial coefficient' } }), s('nCₖ 大', `\\dbinom{n}{${CURSOR}}`, { remark: { zh: '大号组合数', en: 'display-style binomial' } }),
			s('nCₖ 小', `\\tbinom{n}{${CURSOR}}`, { remark: { zh: '小号组合数', en: 'text-style binomial' } }), s('∗', '^{*}', { remark: { zh: '上标星号', en: 'asterisk superscript' } }),
			s('⌊x⌋', '\\lfloor x \\rfloor', { remark: { zh: 'x 的向下取整', en: 'floor of x' } }), s('⌈x⌉', '\\lceil x \\rceil', { remark: { zh: 'x 的向上取整', en: 'ceiling of x' } }),
		],
	},
	{
		id: 'matrix',
		name: b('数组矩阵', 'Arrays & matrices'),
		items: [
			// 矩阵 / 数组类：按钮展示 2×2 案例（a₁₁ = 第 1 行第 1 列的元素），
			// 插入 2×2 空骨架（含 & 列分隔符与 \\ 行分隔符，单元格留白待填）——
			// 「展示案例、插入结构」，用户不必再手写分隔符
			s('( )', `\\begin{pmatrix} ${CURSOR} & \\\\ & \\end{pmatrix}`, { displayLatex: '\\begin{pmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{pmatrix}', remark: { zh: '圆括号矩阵（插入空骨架）', en: 'parenthesized matrix' } }),
			s('[ ]', `\\begin{bmatrix} ${CURSOR} & \\\\ & \\end{bmatrix}`, { displayLatex: '\\begin{bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{bmatrix}', remark: { zh: '方括号矩阵', en: 'bracket matrix' } }),
			s('| |', `\\begin{vmatrix} ${CURSOR} & \\\\ & \\end{vmatrix}`, { displayLatex: '\\begin{vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{vmatrix}', remark: { zh: '行列式', en: 'determinant' } }),
			s('‖ ‖', `\\begin{Vmatrix} ${CURSOR} & \\\\ & \\end{Vmatrix}`, { displayLatex: '\\begin{Vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{Vmatrix}', remark: { zh: '范数矩阵', en: 'norm matrix' } }),
			s('{ }', `\\begin{Bmatrix} ${CURSOR} & \\\\ & \\end{Bmatrix}`, { displayLatex: '\\begin{Bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{Bmatrix}', remark: { zh: '花括号矩阵', en: 'brace matrix' } }),
			s('mx', `\\begin{matrix} ${CURSOR} & \\\\ & \\end{matrix}`, { displayLatex: '\\begin{matrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{matrix}', remark: { zh: '无括号矩阵', en: 'plain matrix' } }),
			s('小 mx', `\\begin{smallmatrix} ${CURSOR} & \\\\ & \\end{smallmatrix}`, { displayLatex: '\\begin{smallmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{smallmatrix}', remark: { zh: '小型矩阵', en: 'small matrix' } }),
			s('⇉ 分段', `\\begin{cases} ${CURSOR} \\end{cases}`, { displayLatex: '\\begin{cases} x, & x > 0 \\\\ 0, & x \\leq 0 \\end{cases}', remark: { zh: '分段函数', en: 'piecewise function' } }),
			s('⩽ 对齐', `\\begin{align} ${CURSOR} \\end{align}`, { displayLatex: '\\begin{align} a &= b \\\\ c &= d \\end{align}', remark: { zh: '对齐公式（带编号）', en: 'aligned equations' } }),
			s('对齐无号', `\\begin{aligned} ${CURSOR} \\end{aligned}`, { displayLatex: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', remark: { zh: '对齐公式（无编号）', en: 'aligned without tags' } }),
			s('arr cc', `\\begin{array}{cc} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{cc} a & b \\\\ c & d \\end{array}', remark: { zh: '数组（两列居中）', en: 'array with two centered columns' } }),
			s('arr cl', `\\begin{array}{cl} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{cl} a & b \\\\ c & d \\end{array}', remark: { zh: '数组（左对齐）', en: 'array with left-aligned column' } }),
			s('arr 三线', `\\begin{array}{ccc} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{ccc} a & b & c \\\\ d & e & f \\end{array}', remark: { zh: '数组（三列）', en: 'array with three columns' } }),
			s('gather', `\\begin{gathered} ${CURSOR} \\end{gathered}`, { displayLatex: '\\begin{gathered} a = b \\\\ c = d \\end{gathered}', remark: { zh: '多行居中公式', en: 'gathered equations' } }),
			s('split', `\\begin{split} ${CURSOR} \\end{split}`, { displayLatex: '\\begin{split} a &= b \\\\ &= c \\end{split}', remark: { zh: '单环境内多行对齐', en: 'split equation' } }),
			s('substack', `\\substack{${CURSOR} \\\\ }`, { displayLatex: '\\substack{a \\\\ b}', span: 2, remark: { zh: '下标堆叠', en: 'substack' } }),
			s('⋯', '\\cdots', { remark: { zh: '居中省略号', en: 'centered dots' } }), s('⋮', '\\vdots', { remark: { zh: '竖向省略号', en: 'vertical dots' } }), s('⋱', '\\ddots', { remark: { zh: '对角省略号', en: 'diagonal dots' } }), s('…', '\\dots', { remark: { zh: '省略号', en: 'dots' } }),
			s('&', '&', { remark: { zh: '列分隔符（对齐用）', en: 'column separator' } }), s('⇉ 2行公式', '\\begin{cases} x, & x > 0 \\\\ 0, & x \\leq 0 \\end{cases}', { remark: { zh: '两行分段函数（案例）', en: 'two-row piecewise (example)' } }),
		],
	},
];
