/**
 * 公式模板库（编译期内联、零网络请求）
 *
 * `latex` 中的 `CURSOR` 表示插入后光标停靠的位置。
 * 模板点选后的行为是「替换编辑区内容」（可 Ctrl+Z 撤销），而非直接写正文。
 */

import { CURSOR } from '../core/constants';
import type { TemplateGroup, TemplateItem } from '../types';

const b = (zh: string, en: string) => ({ zh, en });
const t = (zh: string, en: string, latex: string, tag?: { zh: string; en: string }): TemplateItem => ({
	name: b(zh, en),
	latex,
	...(tag ? { tag } : {}),
});

/** 化学模板依赖 mhchem 扩展（宿主已打包，但需 \require 或启动期注入） */
const MH_CHEM = { zh: '需 mhchem', en: 'needs mhchem' };

export const TEMPLATE_GROUPS: TemplateGroup[] = [
	{
		id: 'fraction',
		name: b('分数与根式', 'Fractions & radicals'),
		items: [
			t('分数', 'Fraction', `\\frac{${CURSOR}}{}`),
			t('大型分数', 'Display fraction', `\\dfrac{${CURSOR}}{}`),
			t('二次根式', 'Square root', `\\sqrt{${CURSOR}}`),
			t('n 次根式', 'nth root', `\\sqrt[n]{${CURSOR}}`),
			t('连分数', 'Continued fraction', 'x = a_{0} + \\cfrac{1}{a_{1} + \\cfrac{1}{a_{2} + \\cfrac{1}{a_{3}}}}'),
			t('部分分式', 'Partial fractions', '\\frac{1}{n(n+1)} = \\frac{1}{n} - \\frac{1}{n+1}'),
			t('分母有理化', 'Rationalized denominator', '\\frac{1}{\\sqrt{a}} = \\frac{\\sqrt{a}}{a}'),
		],
	},
	{
		id: 'script',
		name: b('上下标与运算', 'Scripts & operators'),
		items: [
			t('上下标', 'Superscript & subscript', 'x_{i}^{2}'),
			t('双重下标', 'Nested subscript', 'a_{i,j}'),
			t('指数幂', 'Exponential power', 'e^{-x^{2}}'),
			t('向量', 'Vector', '\\vec{v} = (v_{1}, v_{2}, v_{3})'),
			t('单位向量', 'Unit vector', `\\hat{e}_{${CURSOR}}`),
			t('一阶导数', 'First derivative', '\\frac{\\mathrm{d}y}{\\mathrm{d}x}'),
			t('二阶导数', 'Second derivative', '\\frac{\\mathrm{d}^{2}y}{\\mathrm{d}x^{2}}'),
			t('绝对值', 'Absolute value', `\\left| ${CURSOR} \\right|`),
			t('范数', 'Norm', `\\left\\lVert ${CURSOR} \\right\\rVert`),
			t('取整', 'Floor & ceiling', '\\left\\lfloor x \\right\\rfloor \\leq x \\leq \\left\\lceil x \\right\\rceil'),
		],
	},
	{
		id: 'matrix',
		name: b('矩阵与行列式', 'Matrices & determinants'),
		items: [
			t('2×2 矩阵', '2x2 matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'),
			t('方括号矩阵', 'Bracket matrix', `\\begin{bmatrix} ${CURSOR} \\end{bmatrix}`),
			t('行列式', 'Determinant', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc'),
			t('对角矩阵', 'Diagonal matrix', '\\begin{pmatrix} \\lambda_{1} & & 0 \\\\ & \\ddots & \\\\ 0 & & \\lambda_{n} \\end{pmatrix}'),
			t('增广矩阵', 'Augmented matrix', '\\left( \\begin{array}{cc|c} a_{11} & a_{12} & b_{1} \\\\ a_{21} & a_{22} & b_{2} \\end{array} \\right)'),
			t('单位矩阵', 'Identity matrix', '\\mathbf{I}_{n}'),
			t('矩阵乘法', 'Matrix product', '\\mathbf{A}\\mathbf{B} = \\mathbf{C}'),
			t('转置', 'Transpose', '\\mathbf{A}^{\\mathsf{T}}'),
			t('逆矩阵', 'Inverse', '\\mathbf{A}\\mathbf{A}^{-1} = \\mathbf{I}'),
		],
	},
	{
		id: 'cases',
		name: b('方程组与分段', 'Systems & piecewise'),
		items: [
			t('分段函数', 'Piecewise function', 'f(x) = \\begin{cases} x^{2}, & x \\geq 0 \\\\ -x^{2}, & x < 0 \\end{cases}'),
			t('方程组', 'Linear system', '\\begin{cases} a_{1}x + b_{1}y = c_{1} \\\\ a_{2}x + b_{2}y = c_{2} \\end{cases}'),
			t('多行公式', 'Multi-line formula', '\\begin{align} (a+b)^{2} &= (a+b)(a+b) \\\\ &= a^{2} + ab + ba + b^{2} \\\\ &= a^{2} + 2ab + b^{2} \\end{align}'),
			t('无编号对齐', 'Aligned without tags', '\\begin{aligned} x &= r\\cos\\theta \\\\ y &= r\\sin\\theta \\end{aligned}'),
			t('数组', 'Array', `\\begin{array}{cl} ${CURSOR} & \\\\ & \\end{array}`),
			t('矩阵形式', 'Matrix form', '\\mathbf{A}\\mathbf{x} = \\mathbf{b}'),
		],
	},
	{
		id: 'calculus',
		name: b('微积分', 'Calculus'),
		items: [
			t('不定积分', 'Indefinite integral', '\\int f(x)\\,\\mathrm{d}x'),
			t('定积分', 'Definite integral', '\\int_{a}^{b} f(x)\\,\\mathrm{d}x'),
			t('二重积分', 'Double integral', '\\iint_{D} f(x,y)\\,\\mathrm{d}x\\,\\mathrm{d}y'),
			t('三重积分', 'Triple integral', '\\iiint_{\\Omega} f(x,y,z)\\,\\mathrm{d}V'),
			t('环路积分', 'Contour integral', '\\oint_{C} \\vec{F} \\cdot \\mathrm{d}\\vec{l}'),
			t('偏导数', 'Partial derivative', '\\frac{\\partial f}{\\partial x}'),
			t('混合偏导', 'Mixed partial', '\\frac{\\partial^{2} f}{\\partial x \\partial y}'),
			t('全微分', 'Total differential', '\\mathrm{d}f = \\frac{\\partial f}{\\partial x}\\mathrm{d}x + \\frac{\\partial f}{\\partial y}\\mathrm{d}y'),
			t('梯度', 'Gradient', '\\nabla f = \\left( \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y} \\right)'),
			t('散度', 'Divergence', '\\nabla \\cdot \\vec{F}'),
			t('旋度', 'Curl', '\\nabla \\times \\vec{F}'),
			t('拉普拉斯方程', 'Laplace equation', '\\nabla^{2} \\varphi = 0'),
		],
	},
	{
		id: 'series',
		name: b('极限与级数', 'Limits & series'),
		items: [
			t('极限', 'Limit', '\\lim_{x \\to 0}'),
			t('单侧极限', 'One-sided limit', '\\lim_{x \\to 0^{+}}'),
			t('趋于无穷', 'Limit at infinity', '\\lim_{n \\to \\infty}'),
			t('重要极限', 'Notable limit', '\\lim_{n \\to \\infty} \\left( 1 + \\frac{1}{n} \\right)^{n} = e'),
			t('求和', 'Summation', '\\sum_{n=1}^{\\infty} a_{n}'),
			t('连乘', 'Product', '\\prod_{n=1}^{\\infty} a_{n}'),
			t('泰勒展开', 'Taylor expansion', 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^{n}'),
			t('麦克劳林级数', 'Maclaurin series', 'e^{x} = \\sum_{n=0}^{\\infty} \\frac{x^{n}}{n!}'),
			t('等比级数', 'Geometric series', '\\sum_{n=0}^{\\infty} ar^{n} = \\frac{a}{1-r}, \\quad |r| < 1'),
			t('傅里叶级数', 'Fourier series', 'f(x) = \\frac{a_{0}}{2} + \\sum_{n=1}^{\\infty} \\left( a_{n}\\cos nx + b_{n}\\sin nx \\right)'),
		],
	},
	{
		id: 'stats',
		name: b('统计与概率', 'Statistics & probability'),
		items: [
			t('组合数', 'Binomial coefficient', '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}'),
			t('排列', 'Permutation', '\\mathrm{P}(n,k) = \\frac{n!}{(n-k)!}'),
			t('期望', 'Expectation', '\\mathbb{E}[X] = \\sum_{i} x_{i} p_{i}'),
			t('方差', 'Variance', '\\mathrm{Var}(X) = \\mathbb{E}\\left[ (X-\\mu)^{2} \\right]'),
			t('正态分布', 'Normal density', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} \\exp\\left( -\\frac{(x-\\mu)^{2}}{2\\sigma^{2}} \\right)'),
			t('条件概率', 'Conditional probability', 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}'),
			t('贝叶斯公式', 'Bayes theorem', 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}'),
			t('样本均值', 'Sample mean', '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_{i}'),
			t('标准差', 'Standard deviation', '\\sigma = \\sqrt{\\frac{1}{n} \\sum_{i=1}^{n} (x_{i}-\\bar{x})^{2}}'),
			t('相关系数', 'Correlation coefficient', '\\rho_{XY} = \\frac{\\mathrm{Cov}(X,Y)}{\\sigma_{X}\\sigma_{Y}}'),
		],
	},
	{
		id: 'physics',
		name: b('物理与矢量', 'Physics & vectors'),
		items: [
			t('牛顿第二定律', "Newton's second law", '\\vec{F} = m\\vec{a}'),
			t('万有引力', 'Gravitation', 'F = G\\frac{m_{1}m_{2}}{r^{2}}'),
			t('点积', 'Dot product', '\\vec{a} \\cdot \\vec{b} = |\\vec{a}||\\vec{b}|\\cos\\theta'),
			t('叉积', 'Cross product', '\\vec{a} \\times \\vec{b} = |\\vec{a}||\\vec{b}|\\sin\\theta\\,\\hat{n}'),
			t('质能方程', 'Mass-energy equivalence', 'E = mc^{2}'),
			t('洛伦兹因子', 'Lorentz factor', '\\gamma = \\frac{1}{\\sqrt{1 - v^{2}/c^{2}}}'),
			t('哈密顿量', 'Hamiltonian', '\\mathcal{H} = \\frac{p^{2}}{2m} + V(x)'),
			t('薛定谔方程', 'Schrodinger equation', 'i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi'),
			t('阻尼振动', 'Damped oscillation', '\\ddot{x} + 2\\zeta\\omega_{0}\\dot{x} + \\omega_{0}^{2}x = 0'),
			t('单位矢量', 'Unit vectors', '\\hat{\\imath},\\ \\hat{\\jmath},\\ \\hat{k}'),
		],
	},
	{
		id: 'chem',
		name: b('化学与单位', 'Chemistry & units'),
		items: [
			t('化学式', 'Chemical formula', '\\ce{H2O}', MH_CHEM),
			t('化学反应', 'Reaction equation', '\\ce{2H2 + O2 -> 2H2O}', MH_CHEM),
			t('同位素', 'Isotope', '\\ce{^{235}_{92}U}', MH_CHEM),
			t('离子', 'Ion', '\\ce{SO4^2-}', MH_CHEM),
			t('浓度', 'Concentration', 'c = \\frac{n}{V}'),
			t('pH 值', 'pH value', '\\mathrm{pH} = -\\log_{10}\\left[ \\mathrm{H}^{+} \\right]'),
			t('单位', 'Physical unit', '\\mathrm{m/s^{2}}'),
			t('数量级', 'Order of magnitude', '1.5 \\times 10^{-3}'),
			t('温度', 'Temperature', 'T = 298.15\\,\\mathrm{K}'),
		],
	},
];
