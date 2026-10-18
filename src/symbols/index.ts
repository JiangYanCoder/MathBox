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

/** 第三参数：展示用 latex / 悬停备注（都可省略） */
type SymbolExtra = Pick<SymbolItem, 'displayLatex' | 'remark'>;

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
			s('≤', '\\leq'), s('≥', '\\geq'), s('≠', '\\neq'), s('≈', '\\approx'),
			s('≡', '\\equiv'), s('∼', '\\sim'), s('≃', '\\simeq'), s('≅', '\\cong'),
			s('∝', '\\propto'), s('≪', '\\ll'), s('≫', '\\gg'), s('≍', '\\asymp'),
			s('⊂', '\\subset'), s('⊃', '\\supset'), s('⊆', '\\subseteq'), s('⊇', '\\supseteq'),
			s('∈', '\\in'), s('∋', '\\ni'), s('∉', '\\notin'), s('∌', '\\not\\ni'),
			s('⊥', '\\perp'), s('∥', '\\parallel'), s('∤', '\\nmid'), s('∣', '\\mid'),
			s('≺', '\\prec'), s('≻', '\\succ'), s('⪯', '\\preceq'), s('⪰', '\\succeq'),
			s('⊨', '\\models'), s('⊢', '\\vdash'), s('⊣', '\\dashv'), s('⌣', '\\smile'),
			s('≈ 约等', '\\approx'), s('≐', '\\doteq'), s('⋘', '\\lll'), s('≡ 恒等', '\\equiv'),
		],
	},
	{
		id: 'arrow',
		name: b('箭头', 'Arrows'),
		items: [
			s('→', '\\rightarrow'), s('←', '\\leftarrow'), s('↔', '\\leftrightarrow'), s('↦', '\\mapsto'),
			s('⇒', '\\Rightarrow'), s('⇐', '\\Leftarrow'), s('⇔', '\\Leftrightarrow'), s('⟺', '\\iff'),
			s('⟶', '\\longrightarrow'), s('⟵', '\\longleftarrow'), s('⟹', '\\Longrightarrow'), s('⟸', '\\Longleftarrow'),
			s('↑', '\\uparrow'), s('↓', '\\downarrow'), s('↕', '\\updownarrow'), s('⇑', '\\Uparrow'),
			s('⇓', '\\Downarrow'), s('⇕', '\\Updownarrow'), s('↗', '\\nearrow'), s('↘', '\\searrow'),
			s('↖', '\\nwarrow'), s('↙', '\\swarrow'), s('↪', '\\hookrightarrow'), s('↩', '\\hookleftarrow'),
			s('⇀', '\\rightharpoonup'), s('⇁', '\\rightharpoondown'), s('⇝', '\\rightsquigarrow'), s('⇌', '\\rightleftharpoons'),
			s('x→f', '\\overset{f}{\\longrightarrow}'), s('x←g', '\\overset{g}{\\longleftarrow}'),
		],
	},
	{
		id: 'sets',
		name: b('集合与逻辑', 'Sets & logic'),
		items: [
			s('∅', '\\emptyset'), s('∅ 变体', '\\varnothing'), s('ℕ', '\\mathbb{N}'), s('ℤ', '\\mathbb{Z}'),
			s('ℚ', '\\mathbb{Q}'), s('ℝ', '\\mathbb{R}'), s('ℂ', '\\mathbb{C}'), s('ℙ', '\\mathbb{P}'),
			s('∀', '\\forall'), s('∃', '\\exists'), s('∄', '\\nexists'), s('¬', '\\neg'),
			s('∧', '\\land'), s('∨', '\\lor'), s('⊕', '\\oplus'), s('⟹', '\\implies'),
			s('⟺', '\\iff'), s('∴', '\\therefore'), s('∵', '\\because'), s('□', '\\square'),
			s('◇', '\\Diamond'), s('⊤', '\\top'), s('⊥', '\\bot'), s('∖', '\\setminus'),
			s('⨁', '\\oplus'), s('⊘', '\\oslash'), s('⊎', '\\uplus'), s('△', '\\triangle'),
		],
	},	{
		id: 'fraction',
		name: b('分数微分', 'Fractions & differentials'),
		items: [
			// 展示 a/b 真实分式（而非 \square 占位方块），插入仍是空骨架
			s('a/b', `\\frac{${CURSOR}}{}`, { displayLatex: '\\frac{a}{b}', remark: { zh: '分数（空骨架）', en: 'fraction (empty)' } }),
			s('a/b 大', `\\dfrac{${CURSOR}}{}`, { displayLatex: '\\dfrac{a}{b}', remark: { zh: '大型分数', en: 'display-style fraction' } }),
			s('a/b 小', `\\tfrac{${CURSOR}}{}`, { displayLatex: '\\tfrac{a}{b}', remark: { zh: '小型分数', en: 'text-style fraction' } }),
			s('连分数', '\\cfrac{1}{1 + \\cfrac{1}{1 + \\cfrac{1}{1}}}', { remark: { zh: '连分数', en: 'continued fraction' } }),
			s('a/b 斜', `${CURSOR}/{ }`, { displayLatex: 'a/b' , remark: { zh: '斜杠分数', en: 'slashed fraction' } }),
			s('∂', '\\partial', { remark: { zh: '偏导符号', en: 'partial derivative' } }), s('∂²', '\\partial^{2}', { remark: { zh: '二阶偏导', en: 'second partial derivative' } }), s('∂ᵢ', '\\partial_{i}', { remark: { zh: '对第 i 个变量偏导', en: 'partial with respect to i' } }),
			s('∂y/∂x', '\\frac{\\partial y}{\\partial x}', { remark: { zh: '偏导数', en: 'partial derivative of y' } }),
			s('∂²y/∂x²', '\\frac{\\partial^{2} y}{\\partial x^{2}}', { remark: { zh: '二阶偏导', en: 'second partial derivative' } }),
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
			s('lim', '\\lim'), s('lim→', '\\lim_{x \\to 0}'), s('lim→∞', '\\lim_{n \\to \\infty}'),
			s('lim⁺', '\\lim_{x \\to 0^{+}}'), s('lim⁻', '\\lim_{x \\to 0^{-}}'),
			s('lim‾', '\\limsup'), s('lim_', '\\liminf'),
			s('log', '\\log'), s('ln', '\\ln'), s('lg', '\\lg'),
			s('logₐ', '\\log_{a}'), s('log₁₀', '\\log_{10}'), s('log₂', '\\log_{2}'),
			s('ln x', '\\ln x'), s('log x', '\\log x'), s('eˣ', 'e^{x}'),
			s('exp', '\\exp'), s('aˣ', 'a^{x}'),
			s('max', '\\max'), s('min', '\\min'), s('sup', '\\sup'), s('inf', '\\inf'),
			s('det', '\\det'), s('gcd', '\\gcd'), s('lcm', '\\operatorname{lcm}'),
			s('argmax', '\\argmax'), s('argmin', '\\argmin'), s('deg', '\\deg'),
			s('Pr', '\\Pr'), s('sgn', '\\operatorname{sgn}'),
		],
	},
	{
		id: 'trig',
		name: b('三角函数', 'Trigonometric'),
		items: [
			s('sin', '\\sin'), s('cos', '\\cos'), s('tan', '\\tan'),
			s('cot', '\\cot'), s('sec', '\\sec'), s('csc', '\\csc'),
			s('arcsin', '\\arcsin'), s('arccos', '\\arccos'), s('arctan', '\\arctan'),
			s('arccot', '\\operatorname{arccot}'), s('arcsec', '\\operatorname{arcsec}'),
			s('arccsc', '\\operatorname{arccsc}'),
			s('sin⁻¹', '\\sin^{-1}'), s('cos⁻¹', '\\cos^{-1}'), s('tan⁻¹', '\\tan^{-1}'),
			s('sinh', '\\sinh'), s('cosh', '\\cosh'), s('tanh', '\\tanh'),
			s('coth', '\\coth'), s('sech', '\\operatorname{sech}'), s('csch', '\\operatorname{csch}'),
			s('sin²θ', '\\sin^{2}\\theta'), s('cos²θ', '\\cos^{2}\\theta'),
			s('sin 2θ', '\\sin 2\\theta'), s('cos 2θ', '\\cos 2\\theta'),
			s('tan 2θ', '\\tan 2\\theta'), s('1+tan²', '1 + \\tan^{2}\\theta'),
			s('°', '^{\\circ}'), s('∠', '\\angle'), s('sinh⁻¹', '\\sinh^{-1}'),
		],
	},
	{
		id: 'integral',
		name: b('积分运算', 'Integrals'),
		items: [
			s('∫', '\\int'), s('∬', '\\iint'), s('∭', '\\iiint'), s('∮', '\\oint'),
			s('∫ₐᵇ', '\\int_{a}^{b}'), s('∫₀¹', '\\int_{0}^{1}'), s('∫₋∞∞', '\\int_{-\\infty}^{\\infty}'),
			s('∬_D', '\\iint_{D}'), s('∭_Ω', '\\iiint_{\\Omega}'), s('∮_C', '\\oint_{C}'),
			s('∫fⅆx', '\\int f(x)\\,\\mathrm{d}x'),
			s('∫fⅆx 定', '\\int_{a}^{b} f(x)\\,\\mathrm{d}x'),
			s('∫ᵤ', '\\int_{S}'), s('∫∫∫∫', '\\iiiint'),
			s('∫∫ 域', '\\iint_{D} f(x,y)\\,\\mathrm{d}x\\,\\mathrm{d}y'),
			s('∮F·ⅆl', '\\oint_{C} \\vec{F} \\cdot \\mathrm{d}\\vec{l}'),
			s('∫₀^T', '\\int_{0}^{T}'), s('∫ⅆx/x', '\\int \\frac{\\mathrm{d}x}{x}'),
			s('∂∫', '\\partial \\int'), s('∫ 上下限', '\\int\\limits_{a}^{b}'),
		],
	},
	{
		id: 'bigop',
		name: b('大型运算', 'Large operators'),
		items: [
			s('∑', '\\sum'), s('∏', '\\prod'), s('∐', '\\coprod'),
			s('∑ᵢⁿ', '\\sum_{i=1}^{n}'), s('∑ₙ∞', '\\sum_{n=1}^{\\infty}'),
			s('∑ᵢ', '\\sum_{i}'), s('∏ᵢⁿ', '\\prod_{i=1}^{n}'), s('∏ₙ', '\\prod_{n}'),
			s('⋃', '\\bigcup'), s('⋂', '\\bigcap'), s('⋁', '\\bigvee'), s('⋀', '\\bigwedge'),
			s('⨁', '\\bigoplus'), s('⨂', '\\bigotimes'), s('⨀', '\\bigodot'),
			s('⨄', '\\biguplus'), s('⨆', '\\bigsqcup'), s('⨿', '\\amalg'),
			s('⋃ᵢⁿ', '\\bigcup_{i=1}^{n}'), s('⋂ᵢ', '\\bigcap_{i}'),
			s('∑′', "\\sum'"), s('∫∑', '\\int \\sum'),
			s('⨊', '\\bigsqcup'), s('lim∑', '\\lim_{n \\to \\infty} \\sum'),
			s('∑ᵏ', '\\sum_{k}'), s('∏ⱼ', '\\prod_{j}'),
		],
	},
	{
		id: 'bracket',
		name: b('括号取整', 'Brackets & rounding'),
		items: [
			s('( )', `\\left( ${CURSOR} \\right)`), s('[ ]', `\\left[ ${CURSOR} \\right]`),
			s('{ }', `\\left\\{ ${CURSOR} \\right\\}`), s('⟨ ⟩', `\\left\\langle ${CURSOR} \\right\\rangle`),
			s('| |', `\\left| ${CURSOR} \\right|`), s('‖ ‖', `\\left\\lVert ${CURSOR} \\right\\rVert`),
			s('⌊ ⌋', `\\left\\lfloor ${CURSOR} \\right\\rfloor`),
			s('⌈ ⌉', `\\left\\lceil ${CURSOR} \\right\\rceil`),
			s('⌊ ⌉', `\\left\\lfloor ${CURSOR} \\right\\rceil`),
			s('⟨|', `\\left\\langle ${CURSOR} \\right|`), s('|⟩', `\\left| ${CURSOR} \\right\\rangle`),
			s('( ) 自适应', `\\left( ${CURSOR} \\right)`),
			s('{ } 无定界', `\\{ ${CURSOR} \\}`),
			s('⟦ ⟧', `\\left[\\!\\left[ ${CURSOR} \\right]\\!\\right]`),
			s('( ) 大', '\\Big( \\quad \\Big)'), s('[ ] 大', '\\Big[ \\quad \\Big]'),
			s('⦃ ⦄', `\\left\\{ ${CURSOR} \\right\\}`),
			s('| | 单竖', '\\left| \\quad \\right|'),
			s('nCₖ', `\\binom{n}{${CURSOR}}`), s('nCₖ 大', `\\dbinom{n}{${CURSOR}}`),
			s('nCₖ 小', `\\tbinom{n}{${CURSOR}}`), s('∗', '^{*}'),
			s('⌊x⌋', '\\lfloor x \\rfloor'), s('⌈x⌉', '\\lceil x \\rceil'),
		],
	},
	{
		id: 'matrix',
		name: b('数组矩阵', 'Arrays & matrices'),
		items: [
			// 矩阵 / 数组类：按钮展示 2×2 案例（a₁₁ = 第 1 行第 1 列的元素），
			// 插入的仍是空骨架（`latex` 里只含 CURSOR）——「展示案例、插入留白」
			s('( )', `\\begin{pmatrix} ${CURSOR} \\end{pmatrix}`, { displayLatex: '\\begin{pmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{pmatrix}' }),
			s('[ ]', `\\begin{bmatrix} ${CURSOR} \\end{bmatrix}`, { displayLatex: '\\begin{bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{bmatrix}' }),
			s('| |', `\\begin{vmatrix} ${CURSOR} \\end{vmatrix}`, { displayLatex: '\\begin{vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{vmatrix}' }),
			s('‖ ‖', `\\begin{Vmatrix} ${CURSOR} \\end{Vmatrix}`, { displayLatex: '\\begin{Vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{Vmatrix}' }),
			s('{ }', `\\begin{Bmatrix} ${CURSOR} \\end{Bmatrix}`, { displayLatex: '\\begin{Bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{Bmatrix}' }),
			s('mx', `\\begin{matrix} ${CURSOR} \\end{matrix}`, { displayLatex: '\\begin{matrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{matrix}' }),
			s('小 mx', `\\begin{smallmatrix} ${CURSOR} \\end{smallmatrix}`, { displayLatex: '\\begin{smallmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{smallmatrix}' }),
			s('⇉ 分段', `\\begin{cases} ${CURSOR} \\end{cases}`, { displayLatex: '\\begin{cases} x, & x > 0 \\\\ 0, & x \\leq 0 \\end{cases}' }),
			s('⩽ 对齐', `\\begin{align} ${CURSOR} \\end{align}`, { displayLatex: '\\begin{align} a &= b \\\\ c &= d \\end{align}' }),
			s('对齐无号', `\\begin{aligned} ${CURSOR} \\end{aligned}`, { displayLatex: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}' }),
			s('arr cc', `\\begin{array}{cc} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{cc} a & b \\\\ c & d \\end{array}' }),
			s('arr cl', `\\begin{array}{cl} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{cl} a & b \\\\ c & d \\end{array}' }),
			s('arr 三线', `\\begin{array}{ccc} ${CURSOR} \\end{array}`, { displayLatex: '\\begin{array}{ccc} a & b & c \\\\ d & e & f \\end{array}' }),
			s('gather', `\\begin{gathered} ${CURSOR} \\end{gathered}`, { displayLatex: '\\begin{gathered} a = b \\\\ c = d \\end{gathered}' }),
			s('split', `\\begin{split} ${CURSOR} \\end{split}`, { displayLatex: '\\begin{split} a &= b \\\\ &= c \\end{split}' }),
			s('substack', `\\substack{${CURSOR} \\\\ }`, { displayLatex: '\\substack{a \\\\ b}' }),
			s('⋯', '\\cdots'), s('⋮', '\\vdots'), s('⋱', '\\ddots'), s('…', '\\dots'),
			s('&', '&'), s('\\\\', '\\\\'), s('⇉ 2行公式', '\\begin{cases} x, & x > 0 \\\\ 0, & x \\leq 0 \\end{cases}'),
		],
	},
];
