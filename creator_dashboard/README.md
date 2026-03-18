# Creator Dashboard

本页面用于查看印尼项目中合作 3 次以上的达人池，并按品牌、内容标签、带货类目和合作状态筛选达人。

现在已经支持：

- 按品牌、内容标签、带货类目、转化形式、打标状态筛选
- 点击达人后直接在网页内填写标签
- 支持本地模式和云端同步模式
- 自动保存到当前浏览器的本地存储
- 导出当前筛选结果或全部打标结果为 CSV

## 文件

- `index.html`: 网页入口
- `styles.css`: 页面样式
- `app.js`: 前端交互逻辑
- `supabase_setup.sql`: 云端同步用的初始化 SQL
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

## 开启多人同步

如果你希望多人在同一个公开页面里维护同一份达人标签，推荐使用 Supabase 作为共享数据层。

1. 新建一个 Supabase 项目
2. 在 Supabase SQL Editor 里执行：

```text
/Users/apple/Documents/Playground/creator_dashboard/supabase_setup.sql
```

3. 把 SQL 最后注释里的 `insert into public.creator_sync_workspaces ...` 换成你自己的：

- `workspace_id`
- `workspace_name`
- 团队共享写入口令

4. 打开网页，在“标签维护 -> 云端同步设置”里填写：

- `Supabase URL`
- `Publishable Key` 或 `Anon Key`
- `Workspace ID`
- `编辑人`
- `写入口令`

5. 点击“保存并连接”
6. 如果你之前已经在本地模式里维护过一批标签，可以再点“迁移本地缓存”

## 同步模式说明

- 原始达人池数据依然来自静态 JSON
- 云端只保存“自定义标签”和“达人字段修改”
- 云端不可用时，页面会自动回退到本地缓存，避免当前修改丢失
