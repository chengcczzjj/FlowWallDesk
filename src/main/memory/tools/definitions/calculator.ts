/**
 * 计算器工具
 * 安全地计算数学表达式，支持基本运算和常见数学函数
 * 不使用 eval，而是用安全的表达式解析器
 */
import { tool } from 'ai'
import { z } from 'zod'

/**
 * 安全的数学表达式求值
 * 支持: + - * / % ** ( ) sqrt abs ceil floor round sin cos tan log ln pi e
 * 不使用 eval，避免代码注入
 */
function safeEvaluate(expr: string): number {
  // 预处理：替换常见符号
  let sanitized = expr
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, '(3.141592653589793)')
    .replace(/\bpi\b/gi, '(3.141592653589793)')
    .replace(/\be\b/g, '(2.718281828459045)')

  // 白名单字符检查 — 只允许数字、运算符、括号、小数点和函数名
  if (!/^[0-9+\-*/%^().a-z,]+$/.test(sanitized)) {
    throw new Error(`表达式包含不允许的字符: ${expr}`)
  }

  // 替换数学函数为 Math 调用
  sanitized = sanitized
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/abs\(/g, 'Math.abs(')
    .replace(/ceil\(/g, 'Math.ceil(')
    .replace(/floor\(/g, 'Math.floor(')
    .replace(/round\(/g, 'Math.round(')
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/tan\(/g, 'Math.tan(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/pow\(/g, 'Math.pow(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/max\(/g, 'Math.max(')
    .replace(/\^/g, '**')

  // 最终安全性检查 — 只允许 Math.xxx, 数字, 运算符
  if (/[a-z]/i.test(sanitized.replace(/Math\.(sqrt|abs|ceil|floor|round|sin|cos|tan|log10|log|pow|min|max)/g, ''))) {
    throw new Error(`表达式包含不允许的标识符: ${expr}`)
  }

  // 使用 Function 构造器（比 eval 可控）在严格模式下执行
  const fn = new Function('Math', `"use strict"; return (${sanitized})`)
  const result = fn(Math)

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(`计算结果无效: ${result}`)
  }
  return result
}

export const calculatorTool = tool({
  description:
    '计算数学表达式。支持基本四则运算、幂运算、括号，以及 sqrt/abs/ceil/floor/round/sin/cos/tan/log/ln/pow/min/max 等函数。当用户需要数学计算时使用。',
  inputSchema: z.object({
    expression: z.string().describe('数学表达式，如 "2+3*4", "sqrt(144)", "2^10"'),
  }),
  execute: async ({ expression }) => {
    try {
      const result = safeEvaluate(expression)
      return {
        expression,
        result,
        formatted: Number.isInteger(result) ? result.toString() : result.toFixed(10).replace(/0+$/, '').replace(/\.$/, ''),
      }
    } catch (e) {
      return {
        expression,
        error: (e as Error).message,
      }
    }
  },
})
