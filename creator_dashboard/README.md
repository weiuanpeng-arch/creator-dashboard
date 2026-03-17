# Creator Dashboard

本页面用于查看印尼项目中合作 3 次以上的达人池，并按品牌、内容标签、带货类目和合作状态筛选达人。

现在已经支持：

- 按品牌、内容标签、带货类目、转化形式、打标状态筛选
- 点击达人后直接在网页内填写标签
- 自动保存到当前浏览器的本地存储
- 导出当前筛选结果或全部打标结果为 CSV

## 文件

- `index.html`: 网页入口
- `styles.css`: 页面样式
- `app.js`: 前端交互逻辑
- `build_data.py`: 从 Excel 重新生成网页数据
- `data/creator_pool.json`: 原始网页数据
- `data/creator_pool.js`: 供网页直接读取的数据文件

## 打开方式

1. 直接双击打开 `index.html`
2. 或在当前目录运行：

```bash
python3 -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/creator_dashboard/index.html
```

## 刷新数据

当 Excel 更新后，重新运行：

```bash
python3 /Users/apple/Documents/Playground/creator_dashboard/build_data.py
```

当前默认读取：

```text
/Users/apple/Desktop/达人标签管理_合作3次以上.xlsx
```
