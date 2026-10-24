/**
 * remark-heading-math.mjs
 *
 * KaTeX renders each formula three times (MathML + HTML + a TeX annotation),
 * so a heading like `### 第一步：输入值 ($V_\alpha, V_\beta$)` would produce the
 * anchor slug `第一步输入值-vαvβv_alpha-v_betavαvβ` and the same triple text in
 * the table of contents.
 *
 * Headings are navigation, not prose: keep the TeX source as inline code so the
 * anchor and the TOC entry stay short, readable and stable.
 */
import { visit } from 'unist-util-visit';

export default function remarkHeadingMath() {
  return (tree) => {
    visit(tree, 'heading', (node) => {
      const out = [];
      for (const child of node.children) {
        if (child.type === 'inlineMath' || child.type === 'math') {
          out.push({ type: 'inlineCode', value: child.value });
        } else {
          out.push(child);
        }
      }
      node.children = out;
    });
  };
}