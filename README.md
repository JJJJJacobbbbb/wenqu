# 问渠 - 学生学习助手

> GitHub: https://github.com/JJJJJacobbbbb/wenqu

一款基于 Electron + React 的桌面学习助手，集成文档阅读、AI 对话、笔记管理等功能，支持悬浮窗模式。

## 功能特性

- **文档阅读**：支持 PDF、Word、图片等多种格式
- **AI 对话**：接入多种 AI 模型（OpenAI 兼容 API），支持多模态（视觉/音频/文档）
- **悬浮窗模式**：独立对话窗口，支持置顶、拖动，不遮挡主窗口
- **截图提问**：框选屏幕区域直接发送给 AI 解答
- **会话管理**：每道题独立发送，支持追问和历史会话
- **笔记系统**：AI 自动生成学习摘要，按学科分类管理
- **学科分类**：支持多学科切换，独立配置

## 技术栈

- **框架**：Electron 30 + React 18 + TypeScript
- **构建**：Vite 5 + electron-builder
- **样式**：Tailwind CSS 3
- **状态管理**：Zustand
- **文档解析**：pdfjs-dist、mammoth、docx-preview
- **AI 推理**：marked（Markdown 渲染）、KaTeX（公式渲染）、@xenova/transformers（本地嵌入）

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式（Vite + Electron）
npm run electron:dev

# 构建生产版本
npm run electron:build
```

构建产物在 `release/` 目录下。

## 项目结构

```
src/
  components/        # UI 组件
    ai/              # AI 对话相关（AiPanel、FloatingChat、ChatInput 等）
    document/        # 文档阅读器（PDF、Word、图片）
    notes/           # 笔记列表
    settings/        # 设置页面
  stores/            # Zustand 状态管理
  config/            # 配置预设（AI 服务商、笔记提示词）
  lib/               # 工具函数（AI 客户端、桌面端接口、Markdown 解析等）
electron/            # Electron 主进程
```

## 截图

<!-- TODO: 添加应用截图 -->

## License

MIT
