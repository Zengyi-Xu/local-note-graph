# 本地笔记图谱

本地优先的 Markdown 笔记与知识图谱应用。笔记默认以预览模式打开，可切换到源码编辑；使用 `[[双链]]` 关联笔记。

## 功能

- 笔记列表、Markdown 预览与编辑、关联图谱
- 按类型、身份和标签筛选图谱
- 阅读主题切换与自定义 Typora CSS 导入
- JSON 备份和 Markdown 导入/导出
- Electron Windows 桌面版

## 本地运行

```bash
npm install
npm run dev
npm run build
```

## Windows 打包

```bash
npm run desktop:dist
```

免安装版和安装版位于 `release/`。笔记存放在当前浏览器或桌面应用的本地存储中，两者不会自动共享数据。首次迁移请使用应用内的「导出备份」和「导入备份」。

本公开仓库只包含通用示例，不包含任何用户笔记。不要将自己的 `notes.json`、JSON 备份或其他私人资料提交到公开仓库。
